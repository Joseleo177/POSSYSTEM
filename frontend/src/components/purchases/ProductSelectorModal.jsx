import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../services/api";
import { calcPurchaseItem } from "../../helpers";
import { fmtQtyUnit, isIntegerUnit } from "../../helpers/unitFormatter";
import { PKG_UNITS } from "../../constants/pkg";
import CustomSelect from "../ui/CustomSelect";
import ProductModal from "../ProductModal";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tamaño de página para el scroll infinito
const PAGE_SIZE = 40;

// Normaliza el empaque a la opción canónica de PKG_UNITS ignorando mayúsculas/minúsculas.
// (El modal de producto guarda en MAYÚSCULAS y la orden en Capitalizado → así siempre coinciden.)
const normalizePkgUnit = (u) => {
    if (!u) return "UNIDAD";
    return PKG_UNITS.find(x => x.toLowerCase() === u.toLowerCase()) || u.toUpperCase();
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

function stockColor(qty) {
    if (qty <= 0)  return "text-danger bg-danger/10 border-danger/20";
    if (qty <= 10) return "text-warning bg-warning/10 border-warning/20";
    return "text-success bg-success/10 border-success/20";
}

const STOCK_FILTERS = [
    { key: "todos", label: "Todos" },
    { key: "con",   label: "Con stock" },
    { key: "bajo",  label: "Stock bajo" },
    { key: "sin",   label: "Sin stock" },
];

function matchesStockFilter(stock, filter) {
    const s = parseFloat(stock) || 0;
    if (filter === "con")  return s > 10;
    if (filter === "bajo") return s > 0 && s <= 10;
    if (filter === "sin")  return s <= 0;
    return true;
}

export default function ProductSelectorModal({ open, onClose, onAdd, existingItems = [], editItem = null, invoiceRate = 1, invoiceSym = "Ref.", showLotFields = false }) {
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
    const [showStockFilter, setShowStockFilter] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [categories, setCategories]             = useState([]);
    const [savingNew, setSavingNew]               = useState(false);

    // Reset / init al abrir
    useEffect(() => {
        if (!open) return;
        if (editItem) {
            setStep(2);
            setSelected({
                id:         editItem.product_id,
                name:       editItem.product_name,
                stock:      editItem.stock ?? null,
                unit:       editItem.unit  ?? "",
                cost_price: editItem.unit_cost ?? 0,
            });
            setForm({
                package_unit:    normalizePkgUnit(editItem.package_unit),
                package_size:    String(isIntegerUnit(editItem.unit) ? (Math.floor(parseFloat(editItem.package_size ?? 1)) || 1) : (parseFloat(editItem.package_size ?? 1) || 1)),
                package_qty:     String(editItem.package_qty   ?? "1"),
                package_price:   editItem.package_price != null ? String((parseFloat(editItem.package_price) * invoiceRate).toFixed(2)) : "",
                profit_margin:   String(editItem.profit_margin ?? "30"),
                lot_number:      editItem.lot_number      || "",
                expiration_date: editItem.expiration_date || "",
            });
        } else {
            setStep(1); setSearch(""); setSelected(null); setForm(EMPTY_FORM);
        }
        setStockFilter("todos"); setShowStockFilter(false);
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
            const r = await api.products.getAll(params);
            if (myReq !== reqRef.current) return; // resultado obsoleto
            const data = r.data || r || [];
            setTotal(r.total ?? data.length);
            offsetRef.current = off + data.length;
            setResults(prev => append ? [...prev, ...data] : data);
        } catch {
            if (myReq === reqRef.current && !append) { setResults([]); setTotal(0); }
        } finally {
            if (myReq === reqRef.current) { if (append) setLoadingMore(false); else setSearching(false); }
        }
    }, []);

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

    // Setter para campos de cantidad: si el producto se mide en unidades enteras, descarta la parte decimal.
    const setQtyField = (key, val) => {
        if (isIntegerUnit(selected?.unit)) val = String(val).replace(/[.,].*$/, "");
        setF(key, val);
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

    const openProductModal = async () => {
        if (!categories.length) {
            try { const r = await api.products.getCategories(); setCategories(r.data || []); } catch {}
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

    const handleAdd = () => {
        if (!selected) return;
        if (!form.package_qty || parseFloat(form.package_qty) <= 0) return;
        const result = { ...form, package_price: String(pkgPriceBase), product: selected, ...calc, key: Date.now() };
        if (editItem?.id  !== undefined) result.id  = editItem.id;
        if (editItem?.key !== undefined) result.key = editItem.key;
        onAdd(result);
        onClose();
    };

    if (!open) return null;

    const alreadyInOrder = (id) => existingItems.some(i => i.product?.id === id || i.product_id === id);
    const visibleResults = results.filter(p => matchesStockFilter(p.stock, stockFilter));

    return (
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-xl bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-3">
                        {step === 2 && (
                            <button
                                onClick={() => setStep(1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        )}
                        <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                                {step === 1 ? "Paso 1 de 2" : "Paso 2 de 2"}
                            </div>
                            <div className="text-sm font-black text-content dark:text-white">
                                {step === 1 ? "Seleccionar Producto" : selected?.name}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Step 1 — Lista de productos */}
                {step === 1 && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="shrink-0 px-4 pt-4 pb-3 flex items-center gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Filtrar por nombre o código..."
                                    className="input h-10 pl-10 font-medium"
                                />
                                {searching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="relative shrink-0">
                                <button
                                    onClick={() => setShowStockFilter(v => !v)}
                                    className={`h-10 px-3 flex items-center gap-1.5 rounded-md border text-[10px] font-black uppercase tracking-wide transition-all ${stockFilter !== "todos"
                                        ? "bg-brand-500/10 border-brand-500/30 text-brand-500"
                                        : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.879a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    </svg>
                                    {STOCK_FILTERS.find(f => f.key === stockFilter)?.label}
                                </button>
                                {showStockFilter && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowStockFilter(false)} />
                                        <div className="absolute right-0 z-50 mt-1 w-40 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl p-1">
                                            {STOCK_FILTERS.map(f => (
                                                <button
                                                    key={f.key}
                                                    onClick={() => { setStockFilter(f.key); setShowStockFilter(false); }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${stockFilter === f.key
                                                        ? "bg-brand-500 text-white"
                                                        : "hover:bg-brand-500/10 text-content-subtle hover:text-brand-500"}`}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 pb-4">
                            {searching && results.length === 0 && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {!searching && visibleResults.length === 0 && (
                                <div className="py-6 space-y-3">
                                    <p className="text-center text-[11px] font-bold text-content-subtle dark:text-white/30 uppercase tracking-wide">
                                        {search.trim() ? `Sin resultados para "${search}"` : stockFilter !== "todos" ? `Sin productos · ${STOCK_FILTERS.find(f => f.key === stockFilter)?.label}` : "Sin productos"}
                                    </p>
                                    <div className="flex justify-center">
                                        <button
                                            onClick={openProductModal}
                                            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 text-[11px] font-black uppercase tracking-wide hover:bg-brand-500 hover:text-black transition-all"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                                            Crear producto{search.trim() ? ` "${search.trim()}"` : ""}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-2">
                                {visibleResults.map(p => {
                                    const inOrder = alreadyInOrder(p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => !inOrder && handleSelectProduct(p)}
                                            className={[
                                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                                                inOrder
                                                    ? "border-brand-500/30 bg-brand-500/5 cursor-default"
                                                    : "border-border/20 dark:border-white/5 hover:border-brand-500/40 hover:bg-brand-500/5 active:scale-[0.99] cursor-pointer"
                                            ].join(" ")}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight truncate">{p.name}</span>
                                                    {inOrder && (
                                                        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider bg-brand-500/10 text-brand-500 px-1.5 py-0.5 rounded-md">Ya en orden</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {p.cost_price > 0 && (
                                                        <span className="text-[10px] font-bold text-content-subtle dark:text-white/30">
                                                            Último costo: Ref. {fmt2(p.cost_price)}
                                                        </span>
                                                    )}
                                                    {p.category_name && (
                                                        <span className="text-[10px] font-bold text-content-subtle dark:text-white/30 border-l border-border/20 pl-3">{p.category_name}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-lg border tabular-nums ${stockColor(p.stock)}`}>
                                                {p.stock} {p.unit}
                                            </div>
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
                                <p className="text-center text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest py-3">
                                    {total} producto{total !== 1 ? "s" : ""}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 2 — Formulario de empaque */}
                {step === 2 && selected && (
                    <div className="flex-1 overflow-y-auto">
                        {/* Info del producto */}
                        <div className="px-5 pt-4 pb-3 border-b border-border/10 dark:border-white/5">
                            <div className="flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03] rounded-xl px-3 py-2.5 border border-border/20 dark:border-white/5">
                                <div>
                                    <div className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-0.5">Stock actual</div>
                                    {selected.stock != null ? (
                                        <div className={`text-sm font-black tabular-nums ${stockColor(selected.stock).split(" ")[0]}`}>
                                            {selected.stock} {selected.unit}
                                        </div>
                                    ) : (
                                        <div className="text-sm font-black text-content-subtle opacity-30">—</div>
                                    )}
                                </div>
                                {selected.cost_price > 0 && (
                                    <div className="text-right">
                                        <div className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-0.5">Último costo unit.</div>
                                        <div className="text-sm font-black text-brand-500 tabular-nums">Ref. {fmt2(selected.cost_price)}</div>
                                        {invoiceRate > 1 && (
                                            <div className="text-[10px] text-content-subtle/50 dark:text-white/20 tabular-nums mt-0.5">{invoiceSym} {fmt2(selected.cost_price * invoiceRate)}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-5 pt-4 pb-5 space-y-4">
                            {/* Empaque */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Empaque</label>
                                    <CustomSelect
                                        value={form.package_unit}
                                        onChange={val => setF("package_unit", val)}
                                        options={[
                                            ...PKG_UNITS,
                                            ...(form.package_unit && !PKG_UNITS.some(u => u.toLowerCase() === form.package_unit.toLowerCase()) ? [form.package_unit] : [])
                                        ].map(u => ({ value: u, label: u }))}
                                        placeholder="Tipo..."
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Unids × Empaque</label>
                                    <input
                                        type="number" min="1" step={isIntegerUnit(selected?.unit) ? "1" : "0.001"}
                                        value={form.package_size}
                                        onChange={e => setQtyField("package_size", e.target.value)}
                                        disabled={form.package_unit?.toLowerCase() === "unidad"}
                                        className={`input h-9 text-center font-black tabular-nums ${form.package_unit?.toLowerCase() === "unidad" ? "opacity-30 cursor-not-allowed" : ""}`}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Cant. Empaques</label>
                                    <input
                                        type="number" min="1" step={isIntegerUnit(selected?.unit) ? "1" : "0.001"}
                                        value={form.package_qty}
                                        onChange={e => setQtyField("package_qty", e.target.value)}
                                        className="input h-9 text-center font-black tabular-nums"
                                    />
                                </div>
                            </div>

                            {/* Precio estimado y margen */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                                        Costo × Empaque{invoiceRate > 1 ? <span className="ml-1 text-brand-500/70 normal-case font-bold">({invoiceSym})</span> : ""}
                                    </label>
                                    <input
                                        type="number" min="0" step="0.01"
                                        value={form.package_price}
                                        onChange={e => setF("package_price", e.target.value)}
                                        placeholder="0.00"
                                        className="input h-9 font-black tabular-nums text-brand-500"
                                    />
                                    {invoiceRate > 1 && pkgPriceBase > 0 && (
                                        <p className="text-[9px] text-content-subtle/50 dark:text-white/20 tabular-nums">≈ Ref. {fmt2(pkgPriceBase)}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Margen (%)</label>
                                    <input
                                        type="number" min="0" step="0.1"
                                        value={form.profit_margin}
                                        onChange={e => setF("profit_margin", e.target.value)}
                                        className="input h-9 font-black tabular-nums"
                                    />
                                </div>
                            </div>

                            {/* Cálculos — solo si hay precio */}
                            {calc && parseFloat(form.package_price) > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { label: "Costo Unit.", value: `Ref. ${fmt2(calc.unit_cost)}`, color: "text-info" },
                                        { label: "Precio Venta", value: `Ref. ${fmt2(calc.sale_price)}`, color: "text-success" },
                                        { label: "Total Unids.", value: fmtQtyUnit(calc.total_units, selected.unit), color: "text-warning" },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} className="bg-surface-2/50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-border/20 dark:border-white/5 text-center">
                                            <div className="text-[9px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide mb-0.5">{label}</div>
                                            <div className={`text-xs font-black tabular-nums ${color}`}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Lote y vencimiento — solo en pendiente */}
                            {showLotFields ? (
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">N° de Lote</label>
                                        <input
                                            type="text"
                                            value={form.lot_number || ""}
                                            onChange={e => setF("lot_number", e.target.value)}
                                            placeholder="Ej. LOT-2026-001"
                                            className="input h-9 text-xs font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Fecha Vencimiento</label>
                                        <input
                                            type="date"
                                            value={form.expiration_date || ""}
                                            onChange={e => setF("expiration_date", e.target.value)}
                                            className="input h-9 text-xs font-bold"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-info/5 border border-info/10">
                                    <svg className="w-3.5 h-3.5 text-info/60 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-[10px] font-medium text-info/60">
                                        Lote y fecha de vencimiento se registran al <strong>confirmar</strong> la orden.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5 flex gap-2 bg-surface-2/30 dark:bg-white/[0.02]">
                    <button
                        onClick={onClose}
                        className="flex-1 h-9 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                    >
                        Cancelar
                    </button>
                    {step === 2 && (
                        <button
                            onClick={handleAdd}
                            disabled={!form.package_qty || parseFloat(form.package_qty) <= 0}
                            className={[
                                "flex-[2] h-9 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2",
                                !form.package_qty || parseFloat(form.package_qty) <= 0
                                    ? "bg-surface-2 dark:bg-white/5 text-content-subtle cursor-not-allowed"
                                    : "bg-brand-500 text-white hover:brightness-105 active:scale-[0.99] shadow-lg shadow-brand-500/20"
                            ].join(" ")}
                        >
                            {editItem ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                            )}
                            {editItem ? "Guardar Cambios" : "Agregar a la Orden"}
                        </button>
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
                />
            )}
        </div>
    );
}
