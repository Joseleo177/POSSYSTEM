import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";

const REASONS_OUT = [
    { value: "merma",       label: "Merma (Deterioro/Rotura)" },
    { value: "vencimiento", label: "Producto Vencido" },
    { value: "consumo",     label: "Consumo Interno" },
    { value: "robo",        label: "Robo / Pérdida" },
    { value: "conteo",      label: "Ajuste de Conteo Físico" },
];

const REASONS_IN = [
    { value: "compra",      label: "Compra / Recepción" },
    { value: "devolucion",  label: "Devolución de Cliente" },
    { value: "transferencia", label: "Transferencia Recibida" },
    { value: "produccion",  label: "Producción Interna" },
    { value: "conteo",      label: "Ajuste de Conteo Físico" },
];

function stockColor(qty) {
    const n = parseFloat(qty) || 0;
    if (n <= 0)  return "text-danger";
    if (n <= 10) return "text-warning";
    return "text-success";
}

export default function AdjustmentsView({ selectedWarehouse, notify, onChangeWarehouse }) {
    const [search, setSearch]               = useState("");
    const [allProducts, setAllProducts]     = useState([]);
    const [loadingList, setLoadingList]     = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [saving, setSaving]               = useState(false);
    const [form, setForm] = useState({ quantity: "", type: "out", reason: "merma", notes: "" });

    const reasons = form.type === "out" ? REASONS_OUT : REASONS_IN;

    // Cargar productos del almacén al montar / cambiar almacén
    useEffect(() => {
        if (!selectedWarehouse) return;
        setSelectedProduct(null);
        setSearch("");
        setAllProducts([]);
        setLoadingList(true);
        api.warehouses.getProducts(selectedWarehouse.id, { limit: 200 })
            .then(r => setAllProducts(r.data || []))
            .catch(() => {})
            .finally(() => setLoadingList(false));
    }, [selectedWarehouse?.id]);

    const filtered = search.trim()
        ? allProducts.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.barcode && p.barcode.includes(search))
          )
        : allProducts;

    const handleSelect = (p) => {
        setSelectedProduct(p);
        setForm({ quantity: "", type: "out", reason: "merma", notes: "" });
    };

    const handleSave = async () => {
        if (!selectedProduct) return notify("Selecciona un producto", "err");
        if (!form.quantity || parseFloat(form.quantity) <= 0) return notify("Ingresa una cantidad válida", "err");
        setSaving(true);
        try {
            const finalQty = form.type === "out" ? -Math.abs(form.quantity) : Math.abs(form.quantity);
            await api.warehouses.addStock(selectedWarehouse.id, {
                product_id: selectedProduct.id,
                qty: finalQty,
                notes: `[AJUSTE: ${form.reason.toUpperCase()}] ${form.notes}`,
            });
            notify("Movimiento registrado correctamente");
            // Actualizar stock en la lista local
            setAllProducts(prev => prev.map(p =>
                p.id === selectedProduct.id
                    ? { ...p, stock: parseFloat(p.stock || 0) + parseFloat(finalQty) }
                    : p
            ));
            setSelectedProduct(null);
            setForm(p => ({ quantity: "", type: p.type, reason: p.type === "out" ? "merma" : "compra", notes: "" }));
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setSaving(false);
        }
    };

    if (!selectedWarehouse) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <svg className="w-10 h-10 text-content-subtle opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <p className="text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-40">Selecciona un almacén para realizar movimientos</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white/[0.01]">
            {/* Franja de contexto */}
            <div className="shrink-0 px-4 h-9 border-b border-warning/15 bg-warning/[0.03] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-[10px] font-black uppercase tracking-widest">
                    <svg className="w-3.5 h-3.5 text-warning shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    <span className="text-warning/80">Almacén:</span>
                    <span className="text-content dark:text-white truncate">{selectedWarehouse.name}</span>
                </div>
                {onChangeWarehouse && (
                    <button onClick={onChangeWarehouse}
                        className="shrink-0 h-6 px-2.5 rounded-md text-warning hover:bg-warning hover:text-black text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        Cambiar
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden flex-1 min-h-0">

                {/* ── Columna izquierda: lista de productos ── */}
                <div className="flex flex-col min-h-0 border-r border-border/10 dark:border-white/[0.06]">
                    {/* Buscador */}
                    <div className="shrink-0 px-4 py-3 border-b border-border/10 dark:border-white/[0.06]">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar producto..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-9 pl-9 text-sm"
                            />
                            {search && (
                                <button onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-content-subtle hover:text-content transition-colors">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            )}
                        </div>
                        <p className="text-[9px] font-bold text-content-subtle/40 mt-1.5 uppercase tracking-widest">
                            {loadingList ? "Cargando..." : `${filtered.length} producto${filtered.length !== 1 ? "s" : ""}`}
                        </p>
                    </div>

                    {/* Lista */}
                    <div className="flex-1 overflow-y-auto divide-y divide-border/10 dark:divide-white/[0.04]">
                        {loadingList ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex items-center justify-center py-16">
                                <p className="text-[11px] font-bold text-content-subtle/40 uppercase tracking-wide">Sin productos</p>
                            </div>
                        ) : (
                            filtered.map(p => {
                                const isSelected = selectedProduct?.id === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => handleSelect(p)}
                                        className={[
                                            "w-full px-4 py-3 flex items-center justify-between text-left transition-all",
                                            isSelected
                                                ? "bg-brand-500/10 border-l-2 border-brand-500"
                                                : "hover:bg-white/[0.03] border-l-2 border-transparent"
                                        ].join(" ")}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-[11px] font-black uppercase tracking-tight truncate ${isSelected ? "text-brand-500" : "text-content dark:text-white"}`}>
                                                {p.name}
                                            </p>
                                            {p.category_name && (
                                                <p className="text-[9px] text-content-subtle/50 uppercase tracking-wide mt-0.5">{p.category_name}</p>
                                            )}
                                        </div>
                                        <span className={`shrink-0 text-[11px] font-black tabular-nums ml-3 ${stockColor(p.stock)}`}>
                                            {parseFloat(p.stock || 0)} <span className="text-[9px] opacity-60">{p.unit}</span>
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ── Columna derecha: formulario de ajuste ── */}
                <div className={`flex flex-col overflow-y-auto p-6 space-y-4 transition-all duration-200 ${!selectedProduct ? "opacity-30 pointer-events-none" : ""}`}>
                    {/* Producto seleccionado */}
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${selectedProduct ? "border-brand-500 bg-brand-500/5" : "border-border/20 dark:border-white/[0.06]"}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedProduct ? "bg-brand-500" : "bg-surface-3 dark:bg-white/5"}`}>
                            <svg className={`w-4 h-4 ${selectedProduct ? "text-black" : "text-content-subtle"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-tight text-content dark:text-white truncate">
                                {selectedProduct?.name || "Selecciona un producto"}
                            </p>
                            {selectedProduct && (
                                <p className={`text-[10px] font-black ${stockColor(selectedProduct.stock)}`}>
                                    Stock: {parseFloat(selectedProduct.stock || 0)} {selectedProduct.unit}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Entrada / Salida */}
                    <div className="bg-surface-3 dark:bg-white/5 p-1 rounded-xl flex gap-1 border border-border/10">
                        <button onClick={() => setForm(p => ({ ...p, type: "out", reason: "merma" }))}
                            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "out" ? "bg-danger text-white shadow-lg shadow-danger/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Restar (Salida)
                        </button>
                        <button onClick={() => setForm(p => ({ ...p, type: "in", reason: "compra" }))}
                            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "in" ? "bg-success text-white shadow-lg shadow-success/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Sumar (Entrada)
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Cantidad</label>
                            <input
                                type="number" min="0" step="0.01"
                                placeholder="0.00"
                                value={form.quantity}
                                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                                className={`input h-10 text-[13px] font-black tabular-nums ${form.type === "out" ? "text-danger" : "text-success"}`}
                            />
                        </div>
                        <div>
                            <label className="label">Motivo</label>
                            <CustomSelect
                                value={form.reason}
                                onChange={val => setForm(p => ({ ...p, reason: val }))}
                                options={reasons}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Notas (opcional)</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            rows={3}
                            className="input resize-none p-3 text-[11px] w-full min-h-[80px] leading-relaxed"
                            placeholder="Describe el motivo del movimiento..."
                        />
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving || !selectedProduct}
                        className={`w-full h-11 shadow-xl tracking-[0.15em] font-black ${form.type === "out"
                            ? "bg-danger text-white hover:bg-danger-dark shadow-danger/20"
                            : "bg-success text-white hover:bg-success-dark shadow-success/20"}`}
                    >
                        {saving ? "Registrando..." : "REGISTRAR MOVIMIENTO"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
