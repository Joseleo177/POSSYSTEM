import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";

const REASONS = [
    { value: "merma",      label: "Mermas (Deterioro/Rotura)" },
    { value: "vencimiento",label: "Producto Vencido" },
    { value: "consumo",    label: "Consumo Interno" },
    { value: "conteo",     label: "Conteo Físico / Auditoría" },
    { value: "error",      label: "Error en Pedido" },
];

export default function AdjustmentsView({ selectedWarehouse, notify }) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ quantity: "", type: "out", reason: "merma", notes: "" });

    useEffect(() => {
        if (!search.trim() || !selectedWarehouse) { setResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await api.warehouses.getProducts(selectedWarehouse.id, { search });
                setResults(r.data);
            } catch (e) { console.error(e); }
        }, 300);
        return () => clearTimeout(t);
    }, [search, selectedWarehouse]);

    const handleSave = async () => {
        if (!selectedProduct) return notify("Selecciona un producto", "err");
        if (!form.quantity || parseFloat(form.quantity) <= 0) return notify("Ingresa una cantidad válida", "err");
        setLoading(true);
        try {
            const finalQty = form.type === "out" ? -Math.abs(form.quantity) : Math.abs(form.quantity);
            await api.warehouses.addStock(selectedWarehouse.id, {
                product_id: selectedProduct.id,
                qty: finalQty,
                notes: `[AJUSTE: ${form.reason.toUpperCase()}] ${form.notes}`,
            });
            notify("Ajuste registrado correctamente");
            setSelectedProduct(null);
            setSearch("");
            setForm({ quantity: "", type: "out", reason: "merma", notes: "" });
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    };

    if (!selectedWarehouse) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <svg className="w-10 h-10 text-content-subtle opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <p className="text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-40">Selecciona un almacén para realizar ajustes</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white/[0.01]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-auto">

                {/* ── Columna izquierda: Selección de Producto ── */}
                <div className="space-y-4">
                    <header>
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-1">
                            Paso 1
                        </div>
                        <h2 className="text-xs font-black uppercase tracking-tight text-content dark:text-white">
                            Identificar producto en {selectedWarehouse.name}
                        </h2>
                    </header>

                    <div className="relative group">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o código..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setSelectedProduct(null); }}
                            className="input h-10 pl-9 font-medium"
                        />

                        {/* Resultados de búsqueda — flotante para no desplazar el layout */}
                        {results.length > 0 && !selectedProduct && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 card-premium divide-y divide-border/10 dark:divide-white/5 animate-in fade-in zoom-in-95 duration-200 shadow-xl max-h-72 overflow-y-auto">
                                {results.map(p => (
                                    <button key={p.id} onClick={() => { setSelectedProduct(p); setResults([]); }}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-brand-500/[0.03] transition-colors text-left group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-surface-3 dark:bg-white/5 flex items-center justify-center text-content-subtle">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{p.name}</div>
                                                <div className="text-[10px] text-content-subtle font-bold uppercase tracking-tighter opacity-70">En stock: {p.stock} {p.unit}</div>
                                            </div>
                                        </div>
                                        <svg className="w-3.5 h-3.5 text-content-subtle opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Producto seleccionado (Active State) */}
                    {selectedProduct && (
                        <div className="flex items-center justify-between px-4 py-4 rounded-xl border-2 border-brand-500 bg-brand-500/5 shadow-lg animate-in fade-in duration-300">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                                    <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div>
                                    <div className="text-[12px] font-black text-content dark:text-white uppercase tracking-tight">{selectedProduct.name}</div>
                                    <div className="text-[10px] text-brand-500 font-black uppercase tracking-widest">STOCK ACTUAL: {selectedProduct.stock} {selectedProduct.unit}</div>
                                </div>
                            </div>
                            <button onClick={() => { setSelectedProduct(null); setSearch(""); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-danger hover:bg-danger/10 transition-all border border-transparent hover:border-danger/20">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Columna derecha: Configuración del Ajuste ── */}
                <div className={`space-y-4 transition-all duration-300 ${!selectedProduct ? "opacity-20 pointer-events-none grayscale blur-[1px]" : ""}`}>
                    <header>
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-1">
                            Paso 2
                        </div>
                        <h2 className="text-xs font-black uppercase tracking-tight text-content dark:text-white">
                            Configurar tipo y cantidad de ajuste
                        </h2>
                    </header>

                    {/* Switch: Entrada / Salida */}
                    <div className="bg-surface-3 dark:bg-white/5 p-1 rounded-xl flex gap-1 border border-border/10">
                        <button onClick={() => setForm(p => ({ ...p, type: "out" }))}
                            className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "out" ? "bg-danger text-white shadow-lg shadow-danger/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Restar (Merma)
                        </button>
                        <button onClick={() => setForm(p => ({ ...p, type: "in" }))}
                            className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "in" ? "bg-success text-white shadow-lg shadow-success/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Sumar (Ingreso)
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Cantidad a ajustar</label>
                            <input
                                type="number" min="0" step="0.01"
                                placeholder="0.00"
                                value={form.quantity}
                                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                                className={`input h-10 text-[13px] font-black tabular-nums ${form.type === "out" ? "text-danger" : "text-success"}`}
                            />
                        </div>
                        <div>
                            <label className="label">Motivo o Razón</label>
                            <CustomSelect
                                value={form.reason}
                                onChange={val => setForm(p => ({ ...p, reason: val }))}
                                options={REASONS}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Notas de auditoría</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            rows={3}
                            className="input resize-none p-3 text-[11px] w-full min-h-[100px] leading-relaxed"
                            placeholder="Describe detalladamente el porqué del ajuste..."
                        />
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={loading || !selectedProduct}
                        className={`w-full h-12 shadow-xl tracking-[0.2em] font-black ${form.type === "out"
                            ? "bg-danger text-white hover:bg-danger-dark shadow-danger/20"
                            : "bg-success text-white hover:bg-success-dark shadow-success/20"}`}
                    >
                        {loading ? "Registrando..." : "EJECUTAR AJUSTE"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
