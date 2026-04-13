import { useState, useEffect } from "react";
import { api } from "../services/api";
import CustomSelect from "./ui/CustomSelect";
import { Button } from "./ui/Button";

export default function AperturaCajaModal({ employee, warehouses = [], initialWarehouse, onOpened, onWarehouseChange }) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(initialWarehouse?.id || "");
    const [journals, setJournals] = useState([]); // todos los de tipo efectivo
    const [selected, setSelected] = useState({}); // { [journal_id]: { checked, amount } }
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (initialWarehouse?.id) setSelectedWarehouseId(initialWarehouse.id);
    }, [initialWarehouse]);

    useEffect(() => {
        api.journals.getAll()
            .then(r => {
                const cash = (r.data || []).filter(j => j.type === "efectivo" && j.active !== false);
                setJournals(cash);
                // Pre-seleccionar todos
                const init = {};
                cash.forEach(j => { init[j.id] = { checked: true, amount: "" }; });
                setSelected(init);
            })
            .catch(() => { });
    }, []);

    const toggle = (id) =>
        setSelected(prev => ({ ...prev, [id]: { ...prev[id], checked: !prev[id]?.checked } }));

    const setAmount = (id, val) =>
        setSelected(prev => ({ ...prev, [id]: { ...prev[id], amount: val } }));

    const handleOpen = async () => {
        const journalsData = Object.entries(selected)
            .filter(([, v]) => v.checked)
            .map(([id, v]) => ({ journal_id: parseInt(id), opening_amount: parseFloat(v.amount) || 0 }));

        if (!journalsData.length) return setError("Selecciona al menos un diario de efectivo");
        if (!selectedWarehouseId) return setError("Selecciona un almacén");

        setError("");
        setSaving(true);
        try {
            const res = await api.cashSessions.open({
                employee_id: employee.id,
                warehouse_id: parseInt(selectedWarehouseId),
                journals: journalsData
            });
            onOpened(res.data);
        } catch (e) {
            if (e.status === 409 && e.data?.session) {
                // La sesión ya existe, simplemente la retomamos
                onOpened(e.data.session);
            } else {
                setError(e.message || "Error al abrir caja");
            }
        } finally {
            setSaving(false);
        }
    };

    const anySelected = Object.values(selected).some(v => v.checked);
    const currentWh = warehouses.find(w => w.id === parseInt(selectedWarehouseId)) || initialWarehouse;

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-success opacity-70">Turno de Trabajo</div>
                        <div className="text-sm font-black text-content dark:text-white">Apertura de Caja</div>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* Cajero + Almacén */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-2 dark:bg-white/5 rounded-lg p-3 border border-border/20 dark:border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1">Cajero</div>
                            <div className="text-[13px] font-black text-content dark:text-white truncate">{employee?.full_name || employee?.name}</div>
                        </div>
                        <div className={`bg-surface-2 dark:bg-white/5 rounded-lg p-3 border border-border/20 dark:border-white/5 flex flex-col ${warehouses.length > 1 ? "relative overflow-visible" : ""}`}>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1">Almacén</div>
                            {warehouses.length > 1 ? (
                                <CustomSelect
                                    value={selectedWarehouseId}
                                    onChange={val => {
                                        setSelectedWarehouseId(val);
                                        setError("");
                                        if (onWarehouseChange) onWarehouseChange(val);
                                    }}
                                    options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
                                    placeholder="Selec. Almacén"
                                    className="w-full"
                                />
                            ) : (
                                <div className="text-[13px] font-black text-content dark:text-white truncate">
                                    {currentWh?.name || "Sin Almacén"}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Diarios de efectivo */}
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-3 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-success" />
                            Cajas de Efectivo — Fondo Inicial
                        </div>

                        {journals.length === 0 ? (
                            <div className="text-[11px] text-danger font-bold bg-danger/5 border border-danger/20 rounded-lg p-3">
                                No hay diarios de tipo "efectivo" activos. Configúralos en Contabilidad → Diarios.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {journals.map(j => {
                                    const s = selected[j.id] || { checked: false, amount: "" };
                                    return (
                                        <div key={j.id}
                                            className={`rounded-lg border transition-all overflow-hidden ${s.checked ? "border-success/30 bg-success/5" : "border-border/20 dark:border-white/5 opacity-40"}`}>
                                            <div className="flex items-center gap-3 px-4 py-2.5">
                                                {/* Toggle */}
                                                <button onClick={() => toggle(j.id)}
                                                    className={`relative w-9 h-5 rounded-full transition-colors duration-300 shrink-0 ${s.checked ? "bg-success" : "bg-surface-3 dark:bg-white/10"}`}>
                                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${s.checked ? "translate-x-4" : "translate-x-0"}`} />
                                                </button>
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: j.color || "#27ae60" }} />
                                                <span className="font-black text-[11px] uppercase tracking-wide text-content dark:text-white flex-1">{j.name}</span>
                                            </div>
                                            {s.checked && (
                                                <div className="px-4 pb-3 animate-in slide-in-from-top-1 duration-200">
                                                    <div className="relative">
                                                        <input
                                                            type="number" min="0" step="0.01"
                                                            value={s.amount}
                                                            onChange={e => setAmount(j.id, e.target.value)}
                                                            placeholder="0.00"
                                                            className="input h-9 pr-8 text-[13px] font-black text-success"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-content-subtle dark:text-white/30">$</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Error + botón */}
                    <div className="space-y-3">
                        {error && (
                            <div className="bg-danger/5 border border-danger/20 text-danger text-[11px] font-black uppercase tracking-wide rounded-lg px-4 h-9 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                {error}
                            </div>
                        )}
                        <Button
                            onClick={handleOpen}
                            disabled={saving || !anySelected}
                            className="w-full h-10 bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none disabled:opacity-40"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            {saving ? "Abriendo..." : "Abrir Caja"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
