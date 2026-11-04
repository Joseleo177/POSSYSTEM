import { useEffect, useState } from "react";
import { api } from "../services/api";
import Modal from "./ui/Modal";
import DatePicker from "./ui/DatePicker";
import { Button } from "./ui/Button";
import { fmtDateShort, fmtDate, todayISO, toNameCase } from "../helpers";

// Historial de tasas de una divisa (tabla currency_rates). Lo consulta el cobro cuando el pago es
// de una fecha anterior: el abono que se registra tarde va a la tasa del día en que se pagó. Aquí
// se ve qué tasa quedó cada día y se corrige o completa un día pasado. La de hoy no se toca por
// acá: es la de la tarjeta de Monedas.

const fmtRate = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const ORIGEN = {
    bcv: "BCV",
    "er-api": "En línea",
    manual: "A mano",
    registro: "De los cobros",
    correccion: "Corregida",
};
const INPUT = "h-10 w-full px-3 pl-11 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-semibold tabular-nums text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const parseTasa = (v) => parseFloat(String(v || "").replace(/\./g, "").replace(",", "."));

export default function RateHistoryModal({ currency, onClose, notify }) {
    const [rows, setRows] = useState(null);
    const [dia, setDia] = useState("");
    const [tasa, setTasa] = useState("");

    const cargar = () => api.currencies.history(currency.id, { limit: 90 })
        .then(r => setRows(r.data || []))
        .catch(e => { notify?.(e.message, "err"); setRows([]); });

    useEffect(() => { cargar(); }, [currency.id]);   // eslint-disable-line react-hooks/exhaustive-deps

    const hoy = todayISO();
    const diaValido = /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < hoy;
    const existente = rows?.find(r => r.rate_date === dia);
    const n = parseTasa(tasa);

    const elegir = (r) => { setDia(r.rate_date); setTasa(fmtRate(r.rate).replace(/\./g, "")); };

    const guardar = async () => {
        if (!diaValido || !(n > 0)) return;
        try {
            await api.currencies.setDayRate(currency.id, dia, n);
            notify?.(`Tasa del ${fmtDateShort(dia)} guardada`);
            setDia(""); setTasa("");
            await cargar();
        } catch (e) { notify?.(e.message, "err"); }
    };

    return (
        <Modal open onClose={onClose} title={`Historial de tasas · ${currency.code}`} width={520}>
            <div className="space-y-4">
                <p className="text-[13px] text-content-subtle">
                    Con esta tasa se cobra un pago registrado con fecha anterior. Un día que no aparece
                    usa la del último día guardado antes de él.
                </p>

                {/* Corregir o completar un día pasado */}
                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] p-3.5 space-y-3">
                    <p className="text-[14px] font-semibold text-content dark:text-white">Corregir un día</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <p className="text-[12px] text-content-subtle mb-1.5">Día</p>
                            <DatePicker value={dia} onChange={v => {
                                setDia(v);
                                const r = rows?.find(x => x.rate_date === v);
                                setTasa(r ? fmtRate(r.rate).replace(/\./g, "") : "");
                            }} clearable={false} className="w-full" />
                        </div>
                        <div>
                            <p className="text-[12px] text-content-subtle mb-1.5">Tasa de ese día</p>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-content-subtle pointer-events-none">{currency.symbol}</span>
                                <input value={tasa} onChange={e => setTasa(e.target.value.replace(/[^\d.,]/g, ""))}
                                    inputMode="decimal" autoComplete="off" placeholder="0,00" className={INPUT}
                                    onKeyDown={e => { if (e.key === "Enter") guardar(); }} />
                            </div>
                        </div>
                    </div>
                    {dia && !diaValido && (
                        <p className="text-[12px] text-warning">Solo días pasados. La tasa de hoy se cambia en la tarjeta de la divisa.</p>
                    )}
                    {diaValido && (
                        <p className="text-[12px] text-content-subtle">
                            {existente
                                ? `Ese día tiene ${currency.symbol} ${fmtRate(existente.rate)}. Los cobros ya registrados conservan su tasa.`
                                : "Ese día no tiene tasa propia: se guarda como nueva."}
                        </p>
                    )}
                    {diaValido && n > 0 && (
                        <div className="flex justify-end">
                            <Button onClick={guardar} className="h-12 sm:h-10 w-full sm:w-auto">
                                Guardar tasa del {fmtDateShort(dia)}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Días guardados */}
                {rows === null ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map(i => <div key={i} className="h-11 rounded-lg bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-8 text-center">
                        <div className="text-[13px] font-semibold text-content dark:text-white">Todavía no hay días guardados</div>
                        <div className="text-[12px] text-content-subtle mt-1">Cada vez que se cambie la tasa quedará anotada aquí.</div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-[46vh] lg:overflow-y-auto custom-scrollbar">
                        {rows.map(r => {
                            const esHoy = r.rate_date === hoy;
                            return (
                                <button key={r.rate_date} type="button" disabled={esHoy} onClick={() => elegir(r)}
                                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${esHoy ? "cursor-default" : "hover:bg-surface-2 dark:hover:bg-white/[0.03]"} ${dia === r.rate_date ? "bg-brand-500/[0.06]" : ""}`}>
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">
                                            {fmtDateShort(r.rate_date)}{esHoy && <span className="ml-1.5 font-medium text-content-subtle">· hoy</span>}
                                        </div>
                                        <div className="text-[12px] text-content-subtle truncate">
                                            {ORIGEN[r.source] || r.source}
                                            {r.employee_name ? ` · ${toNameCase(r.employee_name)}` : ""}
                                            <span className="hidden sm:inline">{r.source !== "registro" && r.updated_at ? ` · ${fmtDate(r.updated_at)}` : ""}</span>
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-[14px] font-semibold text-content dark:text-white tabular-nums">
                                        <span className="text-[12px] font-medium text-content-subtle mr-1">{currency.symbol}</span>{fmtRate(r.rate)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
    );
}
