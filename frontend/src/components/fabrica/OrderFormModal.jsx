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
import { INPUT, CARD, Field, Prefijo, SearchPick, parseNum, fmtDims, fmtSize, errMsg } from "./shared";

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
 *   A medida   se describe el trabajo; el producto es opcional.
 *   Estándar   lleva el producto que siempre se fabrica igual.
 *   Para inventario: lo terminado entra al stock con su costo real.
 *   Para un cliente: se factura desde la orden con el precio pactado por el lote.
 *
 * En edición solo cambia lo que el servidor deja cambiar: con la orden facturada, el cliente,
 * la cantidad y el precio quedan fijos.
 */
export default function OrderFormModal({ open, order = null, warehouses, onClose, onSaved }) {
    const { notify, baseCurrency } = useApp();
    const [form, setForm] = useState(() => vacio(warehouses));
    const editing = !!order;
    const locked = editing && !!order.invoiced;

    useEffect(() => {
        if (!open) return;
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

    // Receta del producto elegido, calculada con sus variables (largo, ancho...), escalada a la
    // cantidad y costeada en el almacén. Pedir "Mesón" de 1,80 × 0,60 ya dice qué lleva.
    const [recipe, setRecipe] = useState(null);
    const [recipeError, setRecipeError] = useState(null);
    const [values, setValues] = useState({});
    const [lastProduct, setLastProduct] = useState(null);
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
                // Al elegir el producto: con variables es un trabajo a medida; sin ellas, estándar.
                if (r.data && lastProduct !== form.product.id) {
                    setLastProduct(form.product.id);
                    setForm(f => ({ ...f, type: r.data.params?.length ? "medida" : "estandar" }));
                }
            })
            .catch(e => { if (vivo) setRecipeError(errMsg(e)); });
        return () => { vivo = false; };
    }, [open, form.product?.id, dQty, form.warehouse_id, dValues]);
    useEffect(() => { setValues({}); }, [form.product?.id]);

    const needsProduct = form.type === "estandar" || form.destination === "stock";
    const qty = parseNum(form.quantity);
    const unidadEntera = form.product && isIntegerUnit(form.product.unit);

    const save = async () => {
        if (!editing && !form.warehouse_id) return notify("Elige el almacén de la orden", "err");
        if (needsProduct && !form.product) return notify("Elige el producto que se fabrica", "err");
        if (!form.description.trim()) return notify("Describe qué se va a fabricar", "err");
        if (!(qty > 0)) return notify("La cantidad debe ser mayor que cero", "err");
        if (unidadEntera && !Number.isInteger(qty)) return notify("Ese producto se cuenta por unidades: la cantidad va sin decimales", "err");
        const price = form.sale_price.trim() === "" ? null : parseNum(form.sale_price);
        if (price != null && !(price >= 0)) return notify("El precio no es válido", "err");
        if (!editing && recipeError) return notify(recipeError, "err");

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
                });
                notify(`Orden ${r.data.code} creada`);
                onSaved?.(r.data);
            }
        } catch (e) {
            notify(errMsg(e), "err");
        }
    };

    const sym = baseCurrency?.symbol || "Ref.";

    return (
        <Modal open={open} onClose={onClose} title={editing ? `Editar ${order.code}` : "Nueva orden de fabricación"} width={560}
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

                {!editing && recipe && !recipeError && (
                    <div className={`${CARD} px-4 py-3`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="text-[13px] font-semibold text-content dark:text-white">Según la receta</div>
                            <div className="text-right shrink-0">
                                <Money value={fmtBase(recipe.total_cost, baseCurrency)} className="text-[14px] font-semibold text-content dark:text-white" />
                                <div className="text-[11px] text-content-subtle">costo estimado</div>
                            </div>
                        </div>
                        <ul className="mt-2 space-y-1">
                            {recipe.lines.map((l, i) => (
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
                )}

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

                {form.destination === "cliente" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Cliente" hint="Hace falta para facturar">
                            <SearchPick searchFn={searchCustomers} value={form.customer} onChange={c => set("customer", c)}
                                placeholder="Buscar cliente…" disabled={locked}
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
        </Modal>
    );
}
