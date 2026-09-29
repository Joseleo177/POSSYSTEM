import { useState, useEffect } from "react";
import { api } from "../services/api";
import CustomSelect from "./ui/CustomSelect";
import { Spinner } from "./ui/Spinner";
import { journalsForWarehouse, toNameCase } from "../helpers";
import { useApp } from "../context/AppContext";

export default function AperturaCajaModal({ employee, warehouses = [], initialWarehouse, onOpened, onWarehouseChange, onSkip }) {
    const { activeCurrencies, baseCurrency } = useApp();
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(initialWarehouse?.id || "");
    const [allJournals, setAllJournals] = useState([]); // todos los de tipo efectivo, de cualquier sucursal
    const [selected, setSelected] = useState({}); // { [journal_id]: { checked, amount } }
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (initialWarehouse?.id) setSelectedWarehouseId(initialWarehouse.id);
    }, [initialWarehouse]);

    useEffect(() => {
        api.journals.getAll()
            .then(r => setAllJournals((r.data || []).filter(j => j.type === "efectivo" && j.active !== false)))
            .catch(() => { });
    }, []);

    // Solo las cajas de la sucursal elegida (más las compartidas): abrir turno en Inventario
    // no puede ofrecer la caja de otra tienda, aunque las dos sean de tipo "efectivo".
    const journals = journalsForWarehouse(allJournals, selectedWarehouseId);

    // Al cambiar de sucursal la lista cambia, así que la preselección se recalcula: sin esto,
    // el fondo tecleado para la caja de la sucursal anterior seguía viajando "checked" por
    // debajo, aunque ya no se viera en pantalla.
    useEffect(() => {
        const init = {};
        journals.forEach(j => { init[j.id] = { checked: true, amount: "" }; });
        setSelected(init);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWarehouseId, allJournals]);

    const toggle = (id) =>
        setSelected(prev => ({ ...prev, [id]: { ...prev[id], checked: !prev[id]?.checked } }));

    const setAmount = (id, val) =>
        setSelected(prev => ({ ...prev, [id]: { ...prev[id], amount: val } }));

    // Símbolo de la moneda de cada caja. Antes todas decían "$", también la de bolívares.
    const symbolOf = (j) =>
        (activeCurrencies || []).find(c => c.id === j.currency_id)?.symbol
        || (!j.currency_id ? baseCurrency?.symbol : "")
        || "";

    const handleOpen = async () => {
        const journalsData = Object.entries(selected)
            .filter(([, v]) => v.checked)
            .map(([id, v]) => ({ journal_id: parseInt(id), opening_amount: parseFloat(v.amount) || 0 }));

        if (!journalsData.length) return setError("Selecciona al menos una caja de efectivo");
        if (!selectedWarehouseId) return setError("Selecciona una sucursal");

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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden modal-in">

                {/* Cabecera. Un solo título en caja normal; antes "TURNO DE TRABAJO" en verde
                    versalitas encima de "Apertura de caja" competían entre sí. */}
                <div className="pl-6 pr-4 pt-5 pb-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[17px] font-bold tracking-[-0.015em] text-content dark:text-white">Abrir turno</div>
                        <div className="text-[13px] text-content-subtle">Cuenta el fondo de cada caja antes de empezar a vender.</div>
                    </div>
                    {onSkip && (
                        <button onClick={onSkip} aria-label="Continuar sin abrir caja" title="Continuar sin abrir caja" className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>

                <div className="px-6 pb-6 space-y-5">
                    {/* Cajero y sucursal: una franja de datos, no dos tarjetas. */}
                    <div className="grid grid-cols-2 rounded-lg bg-surface-2 dark:bg-white/[0.04] divide-x divide-border/70 dark:divide-white/[0.06]">
                        <div className="px-3 py-2.5 min-w-0">
                            <div className="text-[12px] text-content-subtle mb-0.5">Cajero</div>
                            <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(employee?.full_name || employee?.name)}</div>
                        </div>
                        <div className={`px-3 py-2.5 min-w-0 ${warehouses.length > 1 ? "relative overflow-visible" : ""}`}>
                            <div className="text-[12px] text-content-subtle mb-0.5">Sucursal</div>
                            {warehouses.length > 1 ? (
                                <CustomSelect
                                    value={selectedWarehouseId}
                                    onChange={val => {
                                        setSelectedWarehouseId(val);
                                        setError("");
                                        if (onWarehouseChange) onWarehouseChange(val);
                                    }}
                                    options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
                                    placeholder="Elegir sucursal"
                                    className="w-full"
                                    boxClassName="h-8"
                                />
                            ) : (
                                <div className="text-[14px] font-semibold text-content dark:text-white truncate">
                                    {toNameCase(currentWh?.name) || "Sin sucursal"}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cajas de efectivo */}
                    <div>
                        <div className="text-[14px] font-semibold text-content dark:text-white">Fondo inicial</div>
                        <div className="text-[12px] text-content-subtle mb-3">Apaga las cajas que no vas a usar en este turno.</div>

                        {journals.length === 0 ? (
                            <div className="text-[13px] text-red-700 dark:text-red-400 bg-red-500/10 rounded-lg p-3">
                                No hay cajas de efectivo activas para esta sucursal. Configúralas en Contabilidad → Diarios.
                            </div>
                        ) : (
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/70 dark:divide-white/[0.06] overflow-hidden">
                                {journals.map(j => {
                                    const s = selected[j.id] || { checked: false, amount: "" };
                                    const sym = symbolOf(j);
                                    return (
                                        <div key={j.id} className={`flex items-center gap-3 px-4 min-h-[60px] transition-colors ${s.checked ? "" : "bg-surface-2/60 dark:bg-white/[0.02]"}`}>
                                            {/* Interruptor en el color de marca */}
                                            <button
                                                onClick={() => toggle(j.id)}
                                                role="switch"
                                                aria-checked={!!s.checked}
                                                aria-label={`Usar ${j.name}`}
                                                className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${s.checked ? "bg-brand-500" : "bg-surface-3 dark:bg-white/15"}`}
                                            >
                                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ${s.checked ? "translate-x-4" : "translate-x-0"}`} />
                                            </button>
                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: j.color || "#94a3b8" }} />
                                            <span className={`text-[14px] font-medium flex-1 truncate ${s.checked ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(j.name)}</span>
                                            {s.checked ? (
                                                <div className="relative w-36 shrink-0">
                                                    <input
                                                        type="number" min="0" step="0.01" inputMode="decimal"
                                                        value={s.amount}
                                                        onChange={e => setAmount(j.id, e.target.value)}
                                                        placeholder="0.00"
                                                        className={`input h-10 text-right text-[15px] font-semibold tabular-nums ${sym ? "pr-11" : ""}`}
                                                    />
                                                    {sym && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-content-subtle pointer-events-none">{sym}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-[12px] text-content-subtle shrink-0">No se usa</span>
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
                            <div className="bg-red-500/10 text-red-700 dark:text-red-400 text-[13px] font-medium rounded-lg px-3 py-2.5 flex items-center gap-2">
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                {error}
                            </div>
                        )}
                        <button
                            onClick={handleOpen}
                            disabled={saving || !anySelected}
                            className={`w-full h-11 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 transition-all ${saving || !anySelected
                                ? "bg-surface-3 dark:bg-white/[0.06] text-content-subtle cursor-not-allowed"
                                : "btn-accent active:scale-[0.99]"}`}
                        >
                            {saving ? <Spinner className="h-4 w-4" /> : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            )}
                            {saving ? "Abriendo…" : "Abrir turno"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
