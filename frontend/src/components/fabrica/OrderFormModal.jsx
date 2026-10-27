import { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import Money from "../ui/Money";
import { useDebounce } from "../../hooks/useDebounce";
import DatePicker from "../ui/DatePicker";
import { isIntegerUnit } from "../../helpers/unitFormatter";
import CustomerModal from "../Customers/CustomerModal";
import ProductModal from "../ProductModal";
import Check from "../ui/Check";
import RecipeModal from "./RecipeModal";
import RecipeLines, { linesToItems, newCut } from "./RecipeLines";
import { INPUT, CARD, Field, Prefijo, SearchPick, parseNum, fmtDims, fmtSize, fromMm, errMsg } from "./shared";


// Lo tecleado en el buscador de clientes: un número es la cédula o el RIF, lo demás el nombre
// (mismo criterio que el buscador del POS).
const clienteNuevo = (q) => {
    const doc = q.match(/^([VEJGP])?-?(\d+)$/i);
    return doc ? { name: "", rif: `${(doc[1] || "V").toUpperCase()}-${doc[2]}` } : { name: q };
};

const vacio = (warehouses) => ({
    type: "medida",
    destination: "cliente",
    product: null,
    description: "",
    quantity: "1",
    customer: null,
    sale_price: "",
    warehouse_id: warehouses.length === 1 ? String(warehouses[0].id) : "",
    notes: "",
    due_date: "",
    assignee: "",
});

/**
 * Alta y edición de una orden de fabricación.
 *
 *   A medida   se describe el trabajo; el producto es opcional. Lleva la receta del producto
 *              con las medidas del cliente (si tiene variables), o "Qué lleva" para escribir lo
 *              que pidió ese cliente: cortes, accesorios y etapas. Si el producto ya tiene
 *              receta, "Qué lleva" arranca con ella cargada y solo se cambia lo distinto; sin
 *              receta arranca vacío y lo escrito puede guardarse como receta del producto.
 *   Estándar   lleva el producto que siempre se fabrica igual, y su receta: sin ella no se crea.
 *   Para inventario: lo terminado entra al stock con su costo real.
 *   Para un cliente: se factura desde la orden con el precio pactado por el lote.
 *
 * En edición solo cambia lo que el servidor deja cambiar: con la orden facturada, el cliente,
 * la cantidad y el precio quedan fijos.
 */
export default function OrderFormModal({ open, order = null, warehouses, materials = [], stages = [], onClose, onSaved }) {
    const { notify, baseCurrency, can } = useApp();
    const [form, setForm] = useState(() => vacio(warehouses));
    const editing = !!order;
    const locked = editing && !!order.invoiced;
    // Texto escrito en los buscadores sin elegir nada: crear la orden así perdía el cliente o el
    // producto en silencio ("jose" tecleado y la orden salía "Sin cliente").
    const [pending, setPending] = useState({ customer: "", product: "" });
    // Alta sin salir del formulario: { kind: "customer" | "product", term }.
    const [creating, setCreating] = useState(null);
    const [categories, setCategories] = useState(null);
    // Lo que lleva una orden a medida sin receta, y si queda como receta del producto.
    const [lines, setLines] = useState({ cuts: [], accs: [], procs: [] });
    const planUnit = "m";   // el taller mide en metros
    const [saveRecipe, setSaveRecipe] = useState(true);
    // Receta creada desde aquí para el producto elegido.
    const [recipeFor, setRecipeFor] = useState(null);
    const [recipeVersion, setRecipeVersion] = useState(0);
    // Producto cuya receta ya se cargó en "Qué lleva": se carga una vez, para no pisar lo editado.
    const [loadedFor, setLoadedFor] = useState(null);

    useEffect(() => {
        if (!open) return;
        setCreating(null);
        setRecipeFor(null);
        setPending({ customer: "", product: "" });
        setLines({ cuts: materials[0] ? [newCut(materials)] : [], accs: [], procs: [] });
        setSaveRecipe(true);
        setLoadedFor(null);
        setForm(order ? {
            type: order.type,
            destination: order.destination,
            product: order.Product || null,
            description: order.description || "",
            quantity: String(order.quantity ?? 1),
            customer: order.Customer || null,
            sale_price: order.sale_price != null ? String(order.sale_price) : "",
            warehouse_id: String(order.warehouse_id),
            notes: order.notes || "",
            due_date: order.due_date || "",
            assignee: order.assignee || "",
        } : vacio(warehouses));
    }, [open, order, warehouses]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const searchProducts = useCallback(async (term) => {
        const r = await api.products.getAll({ search: term, is_combo: false, is_service: false, limit: 20 });
        return (r.data || []).filter(p => !p.piece_mode && !p.is_variant_parent);
    }, []);
    const searchCustomers = useCallback(async (term) => {
        const r = await api.customers.getAll({ search: term, type: "cliente", limit: 20 });
        return r.data || [];
    }, []);

    const pickProduct = (p) => {
        setForm(f => ({ ...f, product: p, description: f.description || (p ? toNameCase(p.name) : "") }));
    };

    const createProduct = async (term) => {
        if (categories === null) {
            try { setCategories((await api.categories.getAll()).data || []); }
            catch { setCategories([]); }
        }
        setCreating({ kind: "product", term });
    };
    const saveNewProduct = async (body, imageFile) => {
        try {
            const r = await api.products.create(body, imageFile);
            pickProduct(r.data || r);
            notify("Producto creado");
            setCreating(null);
        } catch (e) { notify(errMsg(e), "err"); }
    };
    const saveNewCustomer = async (body) => {
        try {
            const r = await api.customers.create(body);
            set("customer", r.data);
            notify("Cliente registrado");
            setCreating(null);
        } catch (e) { notify(errMsg(e), "err"); }
    };
    const whName = warehouses.find(w => String(w.id) === form.warehouse_id)?.name;

    // Receta del producto elegido, calculada con sus variables (largo, ancho...), escalada a la
    // cantidad y costeada en el almacén. Pedir "Mesón" de 1,80 × 0,60 ya dice qué lleva.
    const [recipe, setRecipe] = useState(null);
    const [recipeError, setRecipeError] = useState(null);
    const [values, setValues] = useState({});
    const [lastProduct, setLastProduct] = useState(null);
    // Producto cuya receta ya se consultó: sin esto, mientras llega la respuesta, se vería "no tiene receta".
    const [checkedId, setCheckedId] = useState(null);
    const dQty = useDebounce(form.quantity, 300);
    const dValues = useDebounce(values, 400);
    useEffect(() => {
        if (!open || editing || !form.product?.id) { setRecipe(null); setRecipeError(null); return; }
        let vivo = true;
        const params = { quantity: parseNum(dQty) > 0 ? parseNum(dQty) : 1 };
        if (form.warehouse_id) params.warehouse_id = form.warehouse_id;
        const clean = Object.fromEntries(Object.entries(dValues).filter(([, v]) => String(v).trim() !== ""));
        if (Object.keys(clean).length) params.params = JSON.stringify(clean);
        api.factory.recipePreview(form.product.id, params)
            .then(r => {
                if (!vivo) return;
                setRecipe(r.data);
                setRecipeError(null);
                setCheckedId(form.product.id);
                // Al elegir el producto: con variables es un trabajo a medida; sin ellas, estándar.
                if (r.data && lastProduct !== form.product.id) {
                    setLastProduct(form.product.id);
                    setForm(f => ({ ...f, type: r.data.params?.length ? "medida" : "estandar" }));
                }
            })
            .catch(e => { if (vivo) setRecipeError(errMsg(e)); });
        return () => { vivo = false; };
    }, [open, form.product?.id, dQty, form.warehouse_id, dValues, recipeVersion]);
    useEffect(() => { setValues({}); }, [form.product?.id]);

    const noRecipe = !!form.product && checkedId === form.product.id && !recipe && !recipeError;
    // Estándar sin receta no se puede: se ofrece crearla. A medida sin receta escribe lo suyo.
    const needsRecipe = !editing && form.type === "estandar" && noRecipe;
    // A medida con un producto que tiene receta fija (sin variables): la receta se carga en "Qué
    // lleva" para ajustarla a este cliente. Con variables (largo, ancho), las variables ya son el
    // "a medida" y se sigue la receta.
    const fromRecipe = !editing && form.type === "medida" && !!recipe && !recipeError && !recipe.params?.length;
    const ownPlan = !editing && form.type === "medida" && (!form.product || noRecipe || fromRecipe);

    // Las líneas de la receta, ya calculadas por unidad, como líneas editables en metros.
    const recipeToLines = (r) => {
        const num = (n) => Number(n).toLocaleString("es-VE", { maximumFractionDigits: 3, useGrouping: false });
        const ls = r.lines || [];
        return {
            cuts: ls.filter(l => l.kind === "material").map(l => ({
                material_id: String(l.component_id),
                w: l.cut_width_mm ? fromMm(l.cut_width_mm, "m") : "",
                l: fromMm(l.cut_length_mm, "m"),
                cuts: String(l.cuts),
            })),
            accs: ls.filter(l => l.kind === "accesorio").map(l => ({
                product: { id: l.component_id, name: l.name, unit: l.unit }, quantity: num(l.quantity),
            })),
            procs: ls.filter(l => l.kind === "proceso").map(l => ({ stage_id: String(l.stage_id), minutes: num(l.minutes) })),
        };
    };
    useEffect(() => {
        if (!fromRecipe || loadedFor === form.product?.id) return;
        setLines(recipeToLines(recipe));
        setLoadedFor(form.product.id);
        setSaveRecipe(false);
    }, [fromRecipe, recipe, form.product?.id]);
    const items = ownPlan ? linesToItems(lines) : [];

    // Lo escrito, calculado y costeado en vivo por el servidor, igual que una receta.
    const [planCalc, setPlanCalc] = useState(null);
    const [planError, setPlanError] = useState(null);
    const dDraft = useDebounce(JSON.stringify({ unit: planUnit, items, quantity: parseNum(form.quantity) > 0 ? parseNum(form.quantity) : 1, warehouse_id: form.warehouse_id || undefined }), 500);
    useEffect(() => {
        const draft = JSON.parse(dDraft);
        if (!open || !ownPlan || !draft.items.length) { setPlanCalc(null); setPlanError(null); return; }
        let vivo = true;
        api.factory.evaluateRecipe({ ...draft, params: [] })
            .then(r => { if (vivo) { setPlanCalc(r.data); setPlanError(null); } })
            .catch(e => { if (vivo) { setPlanCalc(null); setPlanError(errMsg(e)); } });
        return () => { vivo = false; };
    }, [dDraft, open, ownPlan]);

    const needsProduct = form.type === "estandar" || form.destination === "stock";
    const qty = parseNum(form.quantity);
    const unidadEntera = form.product && isIntegerUnit(form.product.unit);

    const save = async () => {
        if (!editing && !form.warehouse_id) return notify("Elige el almacén de la orden", "err");
        if (!editing && !form.product && pending.product) return notify(`Elige «${pending.product}» de la lista o créalo; si no, borra lo escrito`, "err");
        if (needsProduct && !form.product) return notify("Elige el producto que se fabrica", "err");
        if (form.destination === "cliente" && !form.customer && pending.customer) return notify(`Elige a «${pending.customer}» de la lista o regístralo; si no, borra lo escrito`, "err");
        if (!form.description.trim()) return notify("Describe qué se va a fabricar", "err");
        if (!(qty > 0)) return notify("La cantidad debe ser mayor que cero", "err");
        if (unidadEntera && !Number.isInteger(qty)) return notify("Ese producto se cuenta por unidades: la cantidad va sin decimales", "err");
        const price = form.sale_price.trim() === "" ? null : parseNum(form.sale_price);
        if (price != null && !(price >= 0)) return notify("El precio no es válido", "err");
        if (!editing && recipeError) return notify(recipeError, "err");
        if (needsRecipe) return notify("Ese producto no tiene receta: créala, o haz la orden A medida", "err");
        if (!editing && form.product && checkedId !== form.product.id) return notify("Un momento: se está leyendo la receta del producto", "err");
        if (ownPlan && !items.length) return notify("Di qué lleva: al menos un corte, un accesorio o una etapa del taller", "err");
        if (ownPlan && planError) return notify(planError, "err");

        try {
            if (editing) {
                const body = {
                    description: form.description.trim(), notes: form.notes.trim() || null,
                    due_date: form.due_date || null, assignee: form.assignee.trim() || null,
                };
                if (!locked) {
                    body.customer_id = form.customer?.id ?? null;
                    body.sale_price = price;
                    if (order.status === "abierta") body.quantity = qty;
                }
                await api.factory.updateOrder(order.id, body);
                notify("Orden actualizada");
                onSaved?.(order);
            } else {
                const r = await api.factory.createOrder({
                    type: form.type,
                    destination: form.destination,
                    product_id: form.product?.id ?? null,
                    description: form.description.trim(),
                    quantity: qty,
                    customer_id: form.destination === "cliente" ? form.customer?.id ?? null : null,
                    sale_price: form.destination === "cliente" ? price : null,
                    warehouse_id: parseInt(form.warehouse_id),
                    notes: form.notes.trim() || null,
                    due_date: form.due_date || null,
                    assignee: form.assignee.trim() || null,
                    params: recipe?.params?.length
                        ? Object.fromEntries(recipe.params.map(p => [p.key, values[p.key] ?? p.default]))
                        : undefined,
                    plan: ownPlan ? {
                        unit: planUnit, items,
                        save_recipe: !!form.product && !fromRecipe && saveRecipe,
                        instructions: fromRecipe ? recipe.instructions || null : undefined,
                    } : undefined,
                });
                notify(`Orden ${r.data.code} creada`);
                onSaved?.(r.data);
            }
        } catch (e) {
            notify(errMsg(e), "err");
        }
    };

    const sym = baseCurrency?.symbol || "Ref.";

    // Lo que lleva la orden, calculado para la cantidad: de la receta o de lo escrito aquí.
    const planCard = (data, title) => (
        <div className={`${CARD} px-4 py-3`}>
            <div className="flex items-start justify-between gap-3">
                <div className="text-[13px] font-semibold text-content dark:text-white">{title}</div>
                <div className="text-right shrink-0">
                    <Money value={fmtBase(data.total_cost, baseCurrency)} className="text-[14px] font-semibold text-content dark:text-white" />
                    <div className="text-[11px] text-content-subtle">costo estimado</div>
                </div>
            </div>
            <ul className="mt-2 space-y-1">
                {data.lines.map((l, i) => (
                    <li key={i} className="text-[12px] text-content-muted dark:text-white/70 flex justify-between gap-3">
                        <span className="truncate">
                            {l.kind === "material"
                                ? `${l.total_cuts} corte${l.total_cuts === 1 ? "" : "s"} de ${fmtDims({ width_mm: l.cut_width_mm, length_mm: l.cut_length_mm })} · ${toNameCase(l.name)}`
                                : l.kind === "proceso"
                                ? `${l.name} · ${Number(l.expected).toLocaleString("es-VE")} min`
                                : `${Number(l.expected).toLocaleString("es-VE")} × ${toNameCase(l.name)}`}
                        </span>
                        {l.kind === "material" && <span className="tabular-nums shrink-0">{fmtSize(l.expected, l.unit)}</span>}
                        {l.kind === "proceso" && <span className="tabular-nums shrink-0"><Money value={fmtBase(l.cost, baseCurrency)} /></span>}
                    </li>
                ))}
            </ul>
        </div>
    );


    return (
        // Con un alta abierta encima, Escape es de ella: cerrar también la orden perdía lo escrito.
        <Modal open={open} onClose={creating || recipeFor ? () => {} : onClose} title={editing ? `Editar ${order.code}` : "Nueva orden de fabricación"} width={ownPlan ? 680 : 560}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} className="h-12 sm:h-10 px-5">{editing ? "Guardar cambios" : "Crear orden"}</Button>
                </div>
            }>
            <div className="space-y-4">
                {!editing && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Tipo de trabajo">
                            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={form.type} onChange={v => set("type", v)}
                                options={[{ key: "medida", label: "A medida" }, { key: "estandar", label: "Estándar" }]} />
                        </Field>
                        <Field label="Lo terminado va">
                            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={form.destination} onChange={v => set("destination", v)}
                                options={[{ key: "cliente", label: "A un cliente" }, { key: "stock", label: "Al inventario" }]} />
                        </Field>
                    </div>
                )}

                {!editing && (
                    <Field label="Producto que se fabrica" hint={needsProduct ? null : "Opcional"}>
                        <SearchPick searchFn={searchProducts} value={form.product} onChange={pickProduct}
                            placeholder="Buscar en el catálogo…"
                            onTermChange={t => setPending(p => ({ ...p, product: t }))}
                            onCreate={can("products.create") ? createProduct : undefined} createLabel="Crear producto"
                            renderItem={p => (
                                <span className="flex items-center justify-between gap-3">
                                    <span className="truncate">{toNameCase(p.name)}</span>
                                    <span className="text-[11px] text-content-subtle shrink-0">{p.unit}</span>
                                </span>
                            )} />
                    </Field>
                )}

                {!editing && recipe?.params?.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {recipe.params.map(p => (
                            <Field key={p.key} label={p.label}>
                                <div className="relative">
                                    <input value={values[p.key] ?? ""} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))}
                                        inputMode="decimal" placeholder={String(p.default).replace(".", ",")}
                                        className={`${INPUT} ${p.unit ? "pr-10" : ""} tabular-nums`} />
                                    {p.unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{p.unit}</span>}
                                </div>
                            </Field>
                        ))}
                    </div>
                )}

                {!editing && recipeError && (
                    <p className="text-[12px] text-red-600 dark:text-red-400">{recipeError}</p>
                )}

                {needsRecipe && (
                    <div className={`${CARD} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3`}>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-content dark:text-white">{toNameCase(form.product.name)} no tiene receta</div>
                            <p className="text-[12px] text-content-subtle">Una orden estándar se hace con la receta: qué cortes, accesorios y tiempo lleva cada unidad.</p>
                        </div>
                        <button type="button" onClick={() => setRecipeFor(form.product)}
                            className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium shrink-0">Crear receta</button>
                    </div>
                )}

                {!editing && recipe && !recipeError && !fromRecipe && planCard(recipe, "Según la receta")}

                <Field label="Trabajo">
                    <input value={form.description} onChange={e => set("description", e.target.value)} maxLength={300}
                        placeholder="Mesón 1,50 × 0,60 con salpicadero" className={INPUT} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Cantidad">
                        <input value={form.quantity} onChange={e => set("quantity", e.target.value)} inputMode={unidadEntera ? "numeric" : "decimal"}
                            disabled={locked || (editing && order.status !== "abierta")} className={`${INPUT} tabular-nums disabled:opacity-60`} />
                    </Field>
                    {!editing && warehouses.length > 1 ? (
                        <Field label="Almacén">
                            <CustomSelect value={form.warehouse_id} onChange={v => set("warehouse_id", v)}
                                options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))} placeholder="Elegir…" />
                        </Field>
                    ) : <div />}
                </div>

                {ownPlan && (
                    <div className="space-y-4 rounded-2xl border border-border/60 dark:border-white/[0.06] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-[14px] font-semibold text-content dark:text-white">Qué lleva</h3>
                                <p className="text-[12px] text-content-subtle">
                                    {fromRecipe
                                        ? `Cargado de la receta de ${toNameCase(form.product.name)}: cambia lo que pidió este cliente. La receta no se modifica.`
                                        : `${form.product ? "El producto no tiene receta: " : ""}las medidas y materiales que pidió el cliente, por unidad.`}
                                </p>
                            </div>
                            {fromRecipe && (
                                <button type="button" onClick={() => setLines(recipeToLines(recipe))}
                                    className="btn-outline h-9 px-3 rounded-lg text-[12px] font-medium shrink-0">Volver a la receta</button>
                            )}
                        </div>
                        <RecipeLines materials={materials} stages={stages} unit={planUnit} lines={lines} setLines={setLines} />
                        {planError && <p className="text-[12px] text-red-600 dark:text-red-400">{planError}</p>}
                        {planCalc && !planError && planCard(planCalc, "Así queda la orden")}
                        {form.product && !fromRecipe && (
                            <label className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => setSaveRecipe(v => !v)}>
                                <Check checked={saveRecipe} onChange={setSaveRecipe} title="Guardar como receta" />
                                <span className="text-[13px] text-content dark:text-white">Guardar como receta de {toNameCase(form.product.name)}, para la próxima vez</span>
                            </label>
                        )}
                    </div>
                )}

                {form.destination === "cliente" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Cliente" hint="Hace falta para facturar">
                            <SearchPick searchFn={searchCustomers} value={form.customer} onChange={c => set("customer", c)}
                                placeholder="Buscar cliente…" disabled={locked}
                                onTermChange={t => setPending(p => ({ ...p, customer: t }))}
                                onCreate={can("customers.create") ? (term => setCreating({ kind: "customer", term, data: clienteNuevo(term) })) : undefined}
                                createLabel="Registrar cliente"
                                renderItem={c => (
                                    <span className="flex items-center justify-between gap-3">
                                        <span className="truncate">{toNameCase(c.name)}</span>
                                        {c.rif && <span className="text-[11px] text-content-subtle shrink-0">{c.rif}</span>}
                                    </span>
                                )} />
                        </Field>
                        <Field label="Precio del lote" hint="Opcional">
                            <div className="relative">
                                <Prefijo>{sym}</Prefijo>
                                <input value={form.sale_price} onChange={e => set("sale_price", e.target.value)} inputMode="decimal"
                                    disabled={locked} placeholder="0.00" className={`${INPUT} pl-11 tabular-nums disabled:opacity-60`} />
                            </div>
                        </Field>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Comprometida para" hint="Opcional">
                        <DatePicker value={form.due_date} onChange={v => set("due_date", v || "")} />
                    </Field>
                    <Field label="Responsable" hint="Opcional">
                        <input value={form.assignee} onChange={e => set("assignee", e.target.value)} maxLength={80}
                            placeholder="Quién la lleva" className={INPUT} />
                    </Field>
                </div>

                <Field label="Notas" hint="Opcional">
                    <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
                        placeholder="Indicaciones del cliente, plano, acabado…"
                        className={`${INPUT} h-auto py-2 resize-none`} />
                </Field>
            </div>

            {/* Mismos formularios que Clientes y el Catálogo: un alta aquí queda igual de completa. */}
            <RecipeModal productId={recipeFor ? "new" : null} initialProduct={recipeFor} materials={materials} stages={stages}
                onClose={() => setRecipeFor(null)}
                onSaved={() => { setRecipeFor(null); setLastProduct(null); setRecipeVersion(v => v + 1); }} />

            {creating?.kind === "customer" && (
                <CustomerModal open onClose={() => setCreating(null)} onSave={saveNewCustomer}
                    editData={creating.data} />
            )}
            {creating?.kind === "product" && (
                <ProductModal open onClose={() => setCreating(null)} onSave={saveNewProduct}
                    categories={categories || []} initialName={creating.term}
                    warehouseId={form.warehouse_id || undefined} warehouseName={whName} warehouseCount={warehouses.length}
                    // Si su código ya existe en otra sucursal, se usa ese en vez de duplicarlo.
                    onPickExisting={p => { pickProduct(p); setCreating(null); }} />
            )}
        </Modal>
    );
}
