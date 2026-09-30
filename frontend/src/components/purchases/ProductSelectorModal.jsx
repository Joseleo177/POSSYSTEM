import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../services/api";
import { calcPurchaseItem } from "../../helpers";
import { fmtQtyUnit, isIntegerUnit } from "../../helpers/unitFormatter";
import { PKG_UNITS } from "../../constants/pkg";
import CustomSelect from "../ui/CustomSelect";
import ProductModal from "../ProductModal";
import Segmented from "../ui/Segmented";
import DatePicker from "../ui/DatePicker";
import StockQty, { splitQty, stockLevel } from "../ui/StockQty";
import { toNameCase } from "../../helpers";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { unidadCorta } from "../warehouses/movementMeta";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// Tamaño de página para el scroll infinito
const PAGE_SIZE = 40;

// Normaliza el empaque a la opción canónica de PKG_UNITS ignorando mayúsculas/minúsculas.
// (El modal de producto guarda en MAYÚSCULAS y la orden en Capitalizado → así siempre coinciden.)
const normalizePkgUnit = (u) => {
    if (!u) return "UNIDAD";
    return PKG_UNITS.find(x => x.toLowerCase() === u.toLowerCase()) || u.toUpperCase();
};

// Plural de la presentación para los rótulos: CAJA → CAJAS, UNIDAD → UNIDADES, FARDO → FARDOS.
// Regla del español: si termina en vocal, +S; si termina en consonante, +ES —por eso UNIDAD
// no puede quedar en "UNIDADS"—, salvo la Y de los extranjerismos ya asentados (DISPLAY →
// DISPLAYS). Las compuestas como MEDIA CAJA se dejan tal cual: "MEDIAS CAJAS" es correcto
// pero suena torcido en una etiqueta, y mejor no pluralizar que inventar una forma rara.
const pluralPkg = (u) => {
    const s = (u || "").trim().toUpperCase();
    if (!s || s.endsWith("S") || s.includes(" ")) return s;
    if (s.endsWith("Z")) return `${s.slice(0, -1)}CES`;
    return /[AEIOUY]$/.test(s) ? `${s}S` : `${s}ES`;
};

const EMPTY_FORM = {
    package_unit: "UNIDAD",
    package_size: "1",
    package_qty: "1",
    package_price: "",
    profit_margin: "30",
    lot_number: "",
    expiration_date: "",
};

// Filtro por existencia con el mismo criterio que el resto de la app: "bajo" usa el mínimo
// del producto cuando lo tiene (ui/StockQty), no un 10 fijo.
const STOCK_FILTERS = [
    { key: "todos", label: "Todos" },
    { key: "con",   label: "Con stock" },
    { key: "bajo",  label: "Stock bajo" },
    { key: "sin",   label: "Agotados" },
];

function matchesStockFilter(p, filter) {
    if (filter === "todos") return true;
    const lvl = stockLevel(p.stock, p.min_stock);
    if (filter === "con")  return lvl === "ok";
    if (filter === "bajo") return lvl === "low";
    if (filter === "sin")  return lvl === "out";
    return true;
}

// warehouseId: almacén de la compra. Se le pasa a ProductModal para que el producto nuevo
// nazca asociado a ese almacén (ProductStock en 0). Sin esto el producto se crea "huérfano"
// y no aparece en el catálogo filtrado por almacén hasta que se reciba la compra.
export default function ProductSelectorModal({ open, onClose, onAdd, existingItems = [], editItem = null, invoiceRate = 1, invoiceSym = "Ref.", showLotFields = false, warehouseId = null }) {
    const [step, setStep]           = useState(1);
    const [search, setSearch]       = useState("");
    const [results, setResults]     = useState([]);
    const [total, setTotal]         = useState(0);
    const [searching, setSearching] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected]   = useState(null);
    const offsetRef = useRef(0);
    const reqRef    = useRef(0);
    const listRef   = useRef(null);
    const [form, setForm]           = useState(EMPTY_FORM);
    const [stockFilter, setStockFilter]         = useState("todos");
    const [showProductModal, setShowProductModal] = useState(false);
    const [categories, setCategories]             = useState([]);
    const [savingNew, setSavingNew]               = useState(false);

    // Reset / init al abrir
    useEffect(() => {
        if (!open) return;
        if (editItem) {
            // El unit/stock puede venir plano (backend) o anidado en .product (ítem agregado en esta sesión, aún sin guardar)
            const editUnit  = editItem.unit  ?? editItem.product?.unit  ?? "";
            const editStock = editItem.stock ?? editItem.product?.stock ?? null;
            setStep(2);
            setSelected({
                id:         editItem.product_id,
                name:       editItem.product_name,
                stock:      editStock,
                unit:       editUnit,
                cost_price: editItem.unit_cost ?? 0,
                // Sin esto, reabrir la línea de un insumo volvía a ofrecer margen y precio
                // de venta, que es justo lo que la compra no le va a escribir.
                sellable: editItem.sellable ?? editItem.product?.sellable ?? true,
            });
            setForm({
                package_unit:    normalizePkgUnit(editItem.package_unit),
                package_size:    String(isIntegerUnit(editUnit) ? (Math.floor(parseFloat(editItem.package_size ?? 1)) || 1) : (parseFloat(editItem.package_size ?? 1) || 1)),
                package_qty:     String(editItem.package_qty   ?? "1"),
                package_price:   editItem.package_price != null ? String((parseFloat(editItem.package_price) * invoiceRate).toFixed(2)) : "",
                profit_margin:   String(editItem.profit_margin ?? "30"),
                lot_number:      editItem.lot_number      || "",
                expiration_date: editItem.expiration_date || "",
            });
        } else {
            setStep(1); setSearch(""); setSelected(null); setForm(EMPTY_FORM);
        }
        setStockFilter("todos");
        setShowProductModal(false);
    }, [open]);

    // Carga una página de productos. append=false reinicia; append=true suma (scroll infinito).
    const loadProducts = useCallback(async (searchVal, append) => {
        const off = append ? offsetRef.current : 0;
        const myReq = append ? reqRef.current : ++reqRef.current; // una carga nueva invalida las anteriores
        if (append) setLoadingMore(true); else setSearching(true);
        try {
            const params = { is_combo: false, is_service: false, limit: PAGE_SIZE, offset: off };
            if (searchVal.trim()) params.search = searchVal.trim();
            // Sin esto la lista mostraba el stock global de la empresa: un producto en 0 en
            // esta sucursal aparecía "con 36 unidades" porque las tenía otra. `for_purchase`
            // es la otra mitad: comprar es cómo un producto entra por primera vez a un
            // almacén, así que warehouse_id no puede excluir del listado a los que todavía no
            // tienen ficha de stock ahí (todo el catálogo aparecería "SIN PRODUCTOS").
            if (warehouseId) { params.warehouse_id = warehouseId; params.for_purchase = true; }
            const r = await api.products.getAll(params);
            if (myReq !== reqRef.current) return; // resultado obsoleto
            const raw = r.data || r || [];
            // `warehouse_stock` es lo que hay en ESTA sucursal; `stock` es el global que trae
            // el producto cuando no se filtra por almacén. El resto del modal ya asume `stock`.
            const data = raw.map(p => ({ ...p, stock: p.warehouse_stock ?? p.stock }));
            setTotal(r.total ?? data.length);
            offsetRef.current = off + data.length;
            setResults(prev => append ? [...prev, ...data] : data);
        } catch {
            if (myReq === reqRef.current && !append) { setResults([]); setTotal(0); }
        } finally {
            if (myReq === reqRef.current) { if (append) setLoadingMore(false); else setSearching(false); }
        }
    }, [warehouseId]);

    // Carga inicial + búsqueda debounceada (reinicia desde offset 0)
    useEffect(() => {
        if (!open) return;
        let active = true;
        const delay = search.trim() ? 350 : 0;
        const t = setTimeout(() => { if (active) loadProducts(search, false); }, delay);
        return () => { active = false; clearTimeout(t); };
    }, [search, open, loadProducts]);

    // Scroll infinito: al acercarse al final, carga la siguiente página
    const handleScroll = () => {
        const el = listRef.current;
        if (!el || loadingMore || searching) return;
        if (results.length >= total) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 140) {
            loadProducts(search, true);
        }
    };

    const setF = (key, val) => setForm(prev => {
        const next = { ...prev, [key]: val };
        if (key === "package_unit" && val.toLowerCase() === "unidad") next.package_size = "1";
        return next;
    });

    // Sanea texto libre a número: solo dígitos y un separador decimal (admite "," o ".", normaliza a ".").
    // Usamos <input type="text"> en vez de type="number" porque en React los inputs numéricos
    // controlados mueven el cursor al final en cada re-render, rompiendo la edición de decimales
    // en medio del texto (p.ej. "10" + "." + "2" terminaba en "102.").
    const sanitizeDecimal = (raw, allowDecimal) => {
        let v = String(raw).replace(/[^\d.,]/g, "");
        if (!allowDecimal) return v.replace(/[.,]/g, "");
        v = v.replace(",", ".");
        const firstDot = v.indexOf(".");
        if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
        return v;
    };

    // Setter para campos de cantidad: si el producto se mide en unidades enteras, descarta la parte decimal.
    const setQtyField = (key, val) => {
        setF(key, sanitizeDecimal(val, !isIntegerUnit(selected?.unit)));
    };

    const handleSelectProduct = (p) => {
        setSelected(p);
        const isUnidad = !p.package_unit || p.package_unit.toLowerCase() === "unidad";
        const rawSize  = isUnidad ? 1 : (parseFloat(p.package_size) || 1);
        // Productos por unidad → tamaño de empaque entero (no admite 12.502)
        const pkgSize  = isIntegerUnit(p.unit) ? (Math.floor(rawSize) || 1) : rawSize;
        setForm({
            package_unit:  normalizePkgUnit(p.package_unit),
            package_size:  isUnidad ? "1" : String(pkgSize),
            package_qty:   "1",
            package_price: p.cost_price ? String((p.cost_price * pkgSize * invoiceRate).toFixed(2)) : "",
            profit_margin: p.profit_margin != null ? String(p.profit_margin) : "30",
        });
        setStep(2);
    };

    const pkgPriceBase = parseFloat(form.package_price) / invoiceRate;
    const calc = selected ? calcPurchaseItem({ ...form, package_price: pkgPriceBase, product: selected }) : null;

    // Cómo se nombra la presentación en los rótulos. "UNIDAD" no es una presentación sino la ausencia
    // de uno: ahí se compra suelto y los rótulos hablan de unidades, no de cajas.
    const pkgSingular = normalizePkgUnit(form.package_unit);
    const pkgPlural   = pluralPkg(pkgSingular);
    const esSuelto    = pkgSingular === "UNIDAD";

    const openProductModal = async () => {
        if (!categories.length) {
            try {
                const r = await api.categories.getAll();
                setCategories(r.data || []);
            } catch (e) {
                // Sin categorías el modal sigue siendo usable ("Sin categoría"), pero el fallo
                // no puede quedar mudo: antes se tragaba incluso el TypeError del método inexistente.
                console.error("[ProductSelectorModal] no se pudieron cargar las categorías:", e);
            }
        }
        setShowProductModal(true);
    };

    const handleProductSaved = async (form, imageFile) => {
        setSavingNew(true);
        try {
            const res = await api.products.create(form, imageFile);
            const newProd = res.data || res;
            setShowProductModal(false);
            setSearch("");
            handleSelectProduct({ ...newProd, stock: newProd.stock ?? 0, cost_price: newProd.cost_price || 0 });
        } catch (e) { alert(e.message); }
        setSavingNew(false);
    };

    // Una línea vale si tiene cuántos empaques entran y cuánto costó cada uno. Sin costo, la
    // mercancía entra al inventario valorizada en cero: el costo del producto se pisa con 0, el
    // margen sale disparatado y, con el interruptor de precio encendido, el PVP calculado
    // también es 0 — el producto queda a la venta regalado.
    const lineaValida = !!selected
        && parseFloat(form.package_qty) > 0
        && parseFloat(form.package_price) > 0;

    const handleAdd = () => {
        if (!lineaValida) return;
        const result = { ...form, package_price: String(pkgPriceBase), product: selected, ...calc, key: Date.now() };
        // El margen del formulario arrastra su valor por defecto aunque el campo no se vea.
        // Sin limpiarlo, la línea de un insumo entraba a la orden prometiendo 30% y un precio
        // de venta que la compra después no aplica.
        if (selected.sellable === false) {
            result.profit_margin = "";
            result.sale_price    = null;
            result.keepsPrice    = true;
        }
        // El servidor decide igual, pero la línea tiene que mostrar desde ya lo que va a pasar.
        result.update_price = !(selected.sellable === false || result.keepsPrice);
        if (editItem?.id  !== undefined) result.id  = editItem.id;
        if (editItem?.key !== undefined) result.key = editItem.key;
        onAdd(result);
        onClose();
    };

    if (!open) return null;

    const alreadyInOrder = (id) => existingItems.some(i => i.product?.id === id || i.product_id === id);
    const visibleResults = results.filter(p => matchesStockFilter(p, stockFilter));
    const pkgNombre   = toNameCase(pkgSingular).toLowerCase();
    const pkgNombres  = toNameCase(pkgPlural).toLowerCase();
    const unidades    = unidadCorta(selected?.unit);
    const precioAntes = parseFloat(selected?.price) || 0;
    const precioNuevo = calc && !calc.keepsPrice ? parseFloat(calc.sale_price) || 0 : 0;
    const cambiaPrecio = selected?.sellable !== false && precioNuevo > 0 && precioAntes > 0 && Math.abs(precioNuevo - precioAntes) >= 0.005;
    const totalLinea  = (parseFloat(form.package_qty) || 0) * (parseFloat(form.package_price) || 0);

    return (
        <div
            className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in"
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-xl bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-t-2xl sm:rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[85vh] modal-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera */}
                <div className="shrink-0 px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {step === 2 && !editItem && (
                            <button onClick={() => setStep(1)} className="row-icon -ml-2" title="Volver a la lista" aria-label="Volver a la lista">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                        )}
                        <div className="min-w-0">
                            <div className="text-[12px] text-content-subtle">
                                {editItem ? "Editar línea" : step === 1 ? "Agregar producto · paso 1 de 2" : "Agregar producto · paso 2 de 2"}
                            </div>
                            <div className="text-[16px] font-semibold tracking-tight text-content dark:text-white truncate">
                                {step === 1 ? "¿Qué vas a comprar?" : "¿Cómo viene y a cuánto?"}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="row-icon -mr-2" title="Cerrar" aria-label="Cerrar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Paso 1 — Lista de productos */}
                {step === 1 && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="shrink-0 px-5 pb-3 space-y-2.5">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar por nombre o código…"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="input h-10 pl-10 pr-9 text-[14px]"
                                />
                                {searching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            {/* Filtro a la vista en vez de escondido en un menú: son cuatro
                                opciones y la de "sin stock" es la que más se usa al reponer. */}
                            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                                <Segmented options={STOCK_FILTERS} value={stockFilter} onChange={setStockFilter} />
                            </div>
                        </div>

                        <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar border-t border-border/60 dark:border-white/[0.06]">
                            {searching && results.length === 0 && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {!searching && visibleResults.length === 0 && (
                                <div className="py-10 px-6 text-center">
                                    <p className="text-[14px] font-semibold text-content dark:text-white">
                                        {search.trim() ? `Nada coincide con "${search.trim()}"` : "Sin productos con ese filtro"}
                                    </p>
                                    <p className="text-[13px] text-content-subtle mt-1">Si es un producto nuevo, créalo aquí mismo y sigue con la compra.</p>
                                    <button onClick={openProductModal}
                                        className="mt-4 btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-95">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4"/></svg>
                                        Crear producto{search.trim() ? ` "${search.trim()}"` : ""}
                                    </button>
                                </div>
                            )}
                            <div className="divide-y divide-border/50 dark:divide-white/[0.04]">
                                {visibleResults.map(p => {
                                    const inOrder = alreadyInOrder(p.id);
                                    const [n, u] = splitQty(p.stock, p.unit);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => !inOrder && handleSelectProduct(p)}
                                            disabled={inOrder}
                                            className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${inOrder ? "opacity-60 cursor-default" : "hover:bg-surface-2/70 dark:hover:bg-white/[0.03] active:bg-surface-2"}`}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative">
                                                {p.image_url ? (
                                                    <img src={resolveImageUrl(p.image_url)} alt="" loading="lazy" onError={imgRetryOnError} className="absolute inset-0 w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-content-subtle/40">{p.name?.charAt(0)}</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[13px] font-semibold text-content dark:text-white truncate">{p.name}</div>
                                                <div className="text-[12px] text-content-subtle truncate tabular-nums">
                                                    {inOrder ? "Ya está en la orden" : [
                                                        toNameCase(p.category_name || "General"),
                                                        p.cost_price > 0 ? `último costo Ref. ${fmt2(p.cost_price)}` : "sin costo registrado",
                                                    ].join(" · ")}
                                                </div>
                                            </div>
                                            {inOrder ? (
                                                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            ) : (
                                                <StockQty qty={p.stock} value={n} unit={u} min={p.min_stock} size="text-[13px]" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Indicador de carga de más resultados (scroll infinito) */}
                            {loadingMore && (
                                <div className="flex items-center justify-center py-4">
                                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {!searching && !loadingMore && results.length > 0 && results.length >= total && (
                                <p className="text-center text-[12px] text-content-subtle py-3">
                                    {total} producto{total !== 1 ? "s" : ""}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Paso 2 — Presentación, costo y resumen */}
                {step === 2 && selected && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* Producto elegido */}
                        <div className="mx-5 flex items-center gap-3 rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-3.5 py-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-[14px] font-semibold text-content dark:text-white truncate">{selected.name}</div>
                                <div className="text-[12px] text-content-subtle tabular-nums">
                                    {selected.cost_price > 0
                                        ? <>Último costo Ref. {fmt2(selected.cost_price)} por {unidadCorta(selected.unit, 1)}{invoiceRate > 1 ? ` (${invoiceSym} ${fmt2(selected.cost_price * invoiceRate)})` : ""}</>
                                        : "Primera compra de este producto"}
                                </div>
                            </div>
                            {selected.stock != null && (
                                <div className="text-right shrink-0">
                                    <div className="text-[11px] text-content-subtle">Existencia</div>
                                    <StockQty qty={selected.stock} value={splitQty(selected.stock, selected.unit)[0]} unit={splitQty(selected.stock, selected.unit)[1]} min={selected.min_stock} size="text-[14px]" />
                                </div>
                            )}
                        </div>

                        <div className="px-5 pt-5 pb-5 space-y-5">
                            {/* ¿Cómo viene? Los rótulos nombran la presentación elegida ("Cajas"
                                y no "Cant. a pedir"), y los campos se alinean abajo para que un
                                rótulo de dos líneas no los desfase. */}
                            <section>
                                <p className="text-[13px] font-semibold text-content dark:text-white mb-2.5">Cómo viene</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div className="col-span-2 sm:col-span-1 flex flex-col justify-end gap-1.5">
                                        <label className="text-[12px] text-content-subtle">Presentación</label>
                                        <CustomSelect
                                            value={form.package_unit}
                                            onChange={val => setF("package_unit", val)}
                                            options={[
                                                ...PKG_UNITS,
                                                ...(form.package_unit && !PKG_UNITS.some(u => u.toLowerCase() === form.package_unit.toLowerCase()) ? [form.package_unit] : [])
                                            ].map(u => ({ value: u, label: toNameCase(u) }))}
                                            placeholder="Tipo…"
                                            className="w-full"
                                            height="h-10"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end gap-1.5">
                                        <label className="text-[12px] text-content-subtle leading-tight">
                                            {/* Comprando suelto no hay envase del que hablar, y el
                                                campo va deshabilitado en 1: el rótulo lo explica. */}
                                            {esSuelto ? "Se compra suelto" : `${unidades.charAt(0).toUpperCase()}${unidades.slice(1)} por ${pkgNombre}`}
                                        </label>
                                        <input
                                            type="text" inputMode="decimal"
                                            value={form.package_size}
                                            onChange={e => setQtyField("package_size", e.target.value)}
                                            disabled={esSuelto}
                                            className="input h-10 text-right text-[14px] font-semibold tabular-nums disabled:opacity-40"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end gap-1.5">
                                        <label className="text-[12px] text-content-subtle leading-tight">Cantidad de {pkgNombres}</label>
                                        <input
                                            type="text" inputMode="decimal"
                                            value={form.package_qty}
                                            onChange={e => setQtyField("package_qty", e.target.value)}
                                            data-autofocus
                                            className="input h-10 text-right text-[14px] font-semibold tabular-nums"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Costo y precio. Sin margen (insumo), el costo ocupa la fila entera. */}
                            <section>
                                <p className="text-[13px] font-semibold text-content dark:text-white mb-2.5">Costo y precio</p>
                                <div className={selected.sellable === false ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] text-content-subtle">Costo por {pkgNombre}</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{invoiceSym}</span>
                                            <input
                                                type="text" inputMode="decimal"
                                                value={form.package_price}
                                                onChange={e => setF("package_price", sanitizeDecimal(e.target.value, true))}
                                                placeholder="0.00"
                                                className="input h-10 pl-11 text-right text-[14px] font-semibold tabular-nums"
                                            />
                                        </div>
                                        {invoiceRate > 1 && pkgPriceBase > 0 && (
                                            <p className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(pkgPriceBase)}</p>
                                        )}
                                    </div>
                                    {/* Un insumo no se vende, así que no hay margen que fijar:
                                        comprarlo solo actualiza su costo. */}
                                    {selected.sellable !== false && (
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] text-content-subtle">Margen de ganancia</label>
                                            <div className="relative">
                                                <input
                                                    type="text" inputMode="decimal"
                                                    value={form.profit_margin}
                                                    onChange={e => setF("profit_margin", sanitizeDecimal(e.target.value, true))}
                                                    placeholder="Sin cambio"
                                                    className="input h-10 pr-8 text-right text-[14px] font-semibold tabular-nums"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                            </div>
                                            {/* Vaciarlo es una decisión válida, no un olvido: hay
                                                productos con precio puesto a mano. */}
                                            {calc?.keepsPrice && (
                                                <p className="text-[12px] text-content-subtle leading-snug">Vacío: se actualiza el costo y el precio de venta queda como está.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Resumen de la línea, como un recibo: lo que entra, lo que cuesta cada
                                una y a cuánto se va a vender. Antes eran tres cajitas de colores. */}
                            {calc && parseFloat(form.package_price) > 0 && (
                                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                    {[
                                        ["Entran al stock", `${fmtQtyUnit(calc.total_units, selected.unit).toLowerCase()}`],
                                        ["Costo por " + unidadCorta(selected.unit, 1), `Ref. ${fmt2(calc.unit_cost)}`],
                                        // El precio de venta se omite en los insumos: la compra no
                                        // se lo va a escribir al producto.
                                        ...(selected.sellable === false ? [] : [[
                                            "Precio de venta",
                                            calc.keepsPrice ? "Sin cambio" : (
                                                <span key="p">
                                                    {cambiaPrecio && <span className="text-content-subtle font-normal line-through decoration-1 mr-2">Ref. {fmt2(precioAntes)}</span>}
                                                    Ref. {fmt2(calc.sale_price)}
                                                </span>
                                            ),
                                        ]]),
                                    ].map(([k, v]) => (
                                        <div key={k} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                                            <span className="text-content-subtle">{k}</span>
                                            <span className="font-medium text-content dark:text-white tabular-nums text-right">{v}</span>
                                        </div>
                                    ))}
                                    <div className="px-4 py-3 flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-white/[0.02] rounded-b-xl">
                                        <span className="text-[13px] font-semibold text-content dark:text-white">Total de la línea</span>
                                        <span className="text-[16px] font-bold text-content dark:text-white tabular-nums">{invoiceSym} {fmt2(totalLinea)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Lote y vencimiento — cuando la mercancía está entrando de verdad */}
                            {showLotFields ? (
                                <section>
                                    <p className="text-[13px] font-semibold text-content dark:text-white mb-2.5">Lote <span className="font-normal text-content-subtle">· opcional</span></p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] text-content-subtle">Número de lote</label>
                                            <input
                                                type="text"
                                                value={form.lot_number || ""}
                                                onChange={e => setF("lot_number", e.target.value)}
                                                placeholder="Ej: L-2026-001"
                                                autoComplete="off"
                                                className="input h-10 text-[13px]"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] text-content-subtle">Vence</label>
                                            <DatePicker value={form.expiration_date || ""} onChange={v => setF("expiration_date", v || "")} placeholder="Sin vencimiento" />
                                        </div>
                                    </div>
                                </section>
                            ) : (
                                <p className="text-[12px] text-content-subtle flex items-start gap-2">
                                    <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    El lote y el vencimiento se cargan al recibir la mercancía.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Pie */}
                <div className="shrink-0 px-5 py-3.5 border-t border-border/60 dark:border-white/[0.06] flex items-center gap-2 safe-area-bottom">
                    {step === 1 ? (
                        <>
                            <button onClick={openProductModal}
                                className="h-10 px-3 rounded-lg text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 flex items-center gap-1.5 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4"/></svg>
                                Producto nuevo
                            </button>
                            <button onClick={onClose} className="ml-auto btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        </>
                    ) : (
                        <>
                            <button onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                            <button
                                onClick={handleAdd}
                                disabled={!lineaValida}
                                title={!lineaValida ? "Falta la cantidad o el costo" : undefined}
                                className="flex-1 btn-accent h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d={editItem ? "M5 13l4 4L19 7" : "M12 4v16m8-8H4"} />
                                </svg>
                                {!lineaValida
                                    ? (parseFloat(form.package_price) > 0 ? "Indica la cantidad" : "Indica el costo")
                                    : `${editItem ? "Guardar cambios" : "Agregar a la orden"} · ${invoiceSym} ${fmt2(totalLinea)}`}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showProductModal && (
                <ProductModal
                    open={showProductModal}
                    onClose={() => setShowProductModal(false)}
                    onSave={handleProductSaved}
                    categories={categories}
                    loading={savingNew}
                    warehouseId={warehouseId}
                    // Lo que se buscó y no apareció es, casi siempre, el nombre del producto
                    // que se va a crear.
                    initialName={search.trim()}
                />
            )}
        </div>
    );
}
