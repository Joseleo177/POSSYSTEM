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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">

            {/* ── Columna izquierda: Producto ── */}
            <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1">
                    1. Buscar producto en {selectedWarehouse.name}
                </div>

                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Nombre o código de producto..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setSelectedProduct(null); }}
                        className="input h-8 pl-8 text-[11px] w-full"
                    />
                </div>

                {/* Resultados */}
                {results.length > 0 && !selectedProduct && (
                    <div className="card-premium overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {results.map(p => (
                            <button key={p.id} onClick={() => { setSelectedProduct(p); setResults([]); }}
                                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-brand-500/10 transition-colors border-b border-border/10 dark:border-white/5 last:border-0">
                                <div>
                                    <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight text-left">{p.name}</div>
                                    <div className="text-[10px] text-content-subtle dark:text-white/30 font-bold">Stock actual: {p.stock} {p.unit}</div>
                                </div>
                                <svg className="w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        ))}
                    </div>
                )}

                {/* Producto seleccionado */}
                {selectedProduct && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-brand-500/30 bg-brand-500/5 animate-in fade-in duration-200">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            </div>
                            <div>
                                <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{selectedProduct.name}</div>
                                <div className="text-[10px] text-content-subtle dark:text-white/30 font-bold">Stock: {selectedProduct.stock} {selectedProduct.unit}</div>
                            </div>
                        </div>
                        <button onClick={() => { setSelectedProduct(null); setSearch(""); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-content-subtle hover:text-danger hover:bg-danger/10 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* ── Columna derecha: Detalles del ajuste ── */}
            <div className={`space-y-3 transition-opacity duration-300 ${!selectedProduct ? "opacity-30 pointer-events-none" : ""}`}>
                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1">
                    2. Detalles del ajuste
                </div>

                {/* Tipo: Restar / Sumar */}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setForm(p => ({ ...p, type: "out" }))}
                        className={`h-10 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${form.type === "out" ? "border-danger/40 bg-danger/5 text-danger" : "border-border/20 dark:border-white/5 text-content-subtle dark:text-white/30 hover:border-danger/20"}`}>
                        <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-wide">Restar Stock</span>
                        </div>
                    </button>
                    <button onClick={() => setForm(p => ({ ...p, type: "in" }))}
                        className={`h-10 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${form.type === "in" ? "border-success/40 bg-success/5 text-success" : "border-border/20 dark:border-white/5 text-content-subtle dark:text-white/30 hover:border-success/20"}`}>
                        <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-wide">Sumar Stock</span>
                        </div>
                    </button>
                </div>

                {/* Cantidad + Motivo */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label">Cantidad</label>
                        <input
                            type="number" min="0" step="0.01"
                            placeholder="0.00"
                            value={form.quantity}
                            onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                            className={`input h-8 text-[11px] font-black ${form.type === "out" ? "text-danger" : "text-success"}`}
                        />
                    </div>
                    <div>
                        <label className="label">Motivo</label>
                        <CustomSelect
                            value={form.reason}
                            onChange={val => setForm(p => ({ ...p, reason: val }))}
                            options={REASONS}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Notas */}
                <div>
                    <label className="label">Notas adicionales</label>
                    <textarea
                        value={form.notes}
                        onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="input resize-none p-2 text-[11px] w-full"
                        placeholder="Describe el motivo para auditoría..."
                    />
                </div>

                {/* Botón */}
                <Button
                    onClick={handleSave}
                    disabled={loading || !selectedProduct}
                    className={`w-full h-9 shadow-none ${form.type === "out"
                        ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white"
                        : "bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black"}`}
                >
                    {loading ? "Registrando..." : "Registrar Ajuste en Inventario"}
                </Button>
            </div>
        </div>
    );
}
