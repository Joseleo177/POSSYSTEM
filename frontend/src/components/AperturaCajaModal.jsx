import { useState, useEffect } from "react";
import { api } from "../services/api";
import CustomSelect from "./CustomSelect";

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
 <div className="w-full max-w-md bg-surface-2 dark:bg-[#141414] border border-border/40 dark:border-white/10 rounded-lg shadow-2xl overflow-hidden">

 {/* Header */}
 <div className="bg-success/10 border-b border-success/20 px-5 h-10 flex items-center gap-3">
 <div className="w-10 rounded-lg bg-success/20 flex items-center justify-center text-xl"></div>
 <div>
 <div className="text-[11px] font-black uppercase tracking-wide text-success/70">TURNO DE TRABAJO</div>
 <div className="text-lg font-black text-content dark:text-content-dark">Apertura de Caja</div>
 </div>
 </div>

 <div className="p-5 space-y-4">
 {/* Cajero + Almacén */}
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-surface-3 dark:bg-white/5 rounded-lg p-4">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Cajero</div>
 <div className="text-sm font-black text-content dark:text-content-dark truncate">{employee?.full_name || employee?.name}</div>
 </div>

 <div className={`bg-surface-3 dark:bg-white/5 rounded-lg p-4 flex flex-col ${warehouses.length > 1 ? "relative overflow-visible" : ""}`}>
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Almacén</div>
 {warehouses.length > 1 ? (
 <CustomSelect
 value={selectedWarehouseId}
 onChange={val => {
 setSelectedWarehouseId(val);
 setError(""); // Limpiamos error al cambiar almacén
 if (onWarehouseChange) onWarehouseChange(val);
 }}
 options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
 placeholder="Selec. Almacén"
 className="w-full"
 />
 ) : (
 <div className="text-sm font-black text-content dark:text-content-dark truncate">
 {currentWh?.name || "Sin Almacén"}
 </div>
 )}
 </div>
 </div>

 {/* Diarios de efectivo */}
 <div className="pt-2">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted mb-4 flex items-center gap-2">
 <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
 Cajas de Efectivo — Fondo Inicial
 </div>

 {journals.length === 0 ? (
 <div className="text-xs text-danger font-bold bg-danger/5 border border-danger/20 rounded-lg p-3">
 No hay diarios de tipo "efectivo" activos. Configúralos en Contabilidad → Diarios.
 </div>
 ) : (
 <div className="grid grid-cols-1 gap-2.5">
 {journals.map(j => {
 const s = selected[j.id] || { checked: false, amount: "" };
 return (
 <div key={j.id}
 className={`rounded-lg border-2 transition-all overflow-hidden
 ${s.checked ? "border-success/40 bg-success/5" : "border-border/30 dark:border-white/10 opacity-30 shadow-inner"}`}>
 <div className="flex items-center gap-3 px-4 py-3">
 <button onClick={() => toggle(j.id)}
 className={`relative w-9 h-5 rounded-full transition-colors duration-300 shrink-0 cursor-pointer
 ${s.checked ? "bg-success" : "bg-surface-3 dark:bg-white/10"}`}>
 <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300
 ${s.checked ? "translate-x-4" : "translate-x-0"}`} />
 </button>
 <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ background: j.color || "#27ae60" }} />
 <span className="font-black text-[11px] uppercase tracking-wider text-content dark:text-content-dark flex-1">{j.name}</span>
 </div>

 {s.checked && (
 <div className="px-4 pb-4 animate-in slide-in-from-top-1 duration-200">
 <div className="relative">
 <input
 type="number" min="0" step="0.01"
 value={s.amount}
 onChange={e => setAmount(j.id, e.target.value)}
 placeholder="0.00"
 className="w-full bg-white/10 dark:bg-white/5 border border-success/20 rounded-lg px-3 py-2 pr-8 text-lg font-black text-success outline-none focus:ring-2 focus:ring-success/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
 />
 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-success/50 text-xs font-black tracking-wide">$</span>
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>

 <div className="pt-4 space-y-4">
 {error && (
 <div className="bg-danger/10 border border-danger/20 text-danger text-xs font-black uppercase tracking-wider rounded-lg px-5 h-10 flex items-center gap-3">
 <span className="text-sm">⚠️</span> {error}
 </div>
 )}

 <button onClick={handleOpen} disabled={saving || !anySelected}
 className={`w-full h-10 rounded-lg font-black text-xs uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2
 ${saving || !anySelected
 ? "bg-surface-3 dark:bg-white/5 text-content-subtle cursor-not-allowed"
 : "bg-success text-white hover:scale-[1.02] active:scale-95 shadow-xl shadow-success/20 ring-1 ring-white/10"}`}>
 {saving ? "Abriendo..." : "Abrir Caja"}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
