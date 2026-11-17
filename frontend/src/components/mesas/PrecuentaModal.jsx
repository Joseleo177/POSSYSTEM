import { useMemo, useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { fmtMoney, fmtDate, toNameCase } from "../../helpers";
import { monedaLocal } from "../../helpers/currency";
import { useApp } from "../../context/AppContext";
import { printPrecuenta } from "../../helpers/printPrecuenta";
import { api } from "../../services/api";

const Svg = ({ d, className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);

const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Previsualización en pantalla de la precuenta de la mesa.
 * Muestra el desglose por puesto, servicio sugerido, totales en Ref. y Bs.,
 * y botón para imprimir el ticket térmico.
 */
export default function PrecuentaModal({
    open,
    onClose,
    cuenta,
    table,
    sym = "Ref.",
    notify,
    onBillRequested,
}) {
    const { companyInfo, printerWidth, activeCurrencies } = useApp();
    const [imprimiendo, setImprimiendo] = useState(false);
    const [servicePct, setServicePct] = useState(0);
    const [customTip, setCustomTip] = useState("");
    const [tipCurrency, setTipCurrency] = useState("base"); // "base" | "local"

    // Moneda local y tasa del día
    const local = monedaLocal(activeCurrencies);
    const tasaLocal = parseFloat(local?.exchange_rate) || 0;
    const localSym = local?.symbol || "Bs.";

    // Al abrir, marcar en el servidor que la mesa pidió la cuenta (para pintar el mapa)
    useEffect(() => {
        if (!open || !cuenta?.id) return;
        if (!cuenta.bill_requested_at) {
            api.tables.requestBill(cuenta.id, true)
                .then(() => onBillRequested?.())
                .catch(() => { /* silencioso si falla */ });
        }
    }, [open, cuenta?.id, cuenta?.bill_requested_at, onBillRequested]);

    // Agrupar platos por puesto con sus adicionales
    const grupos = useMemo(() => {
        const items = cuenta?.items || [];
        const platos = [];
        for (const it of items) {
            const m = parseFloat(it.subtotal ?? (parseFloat(it.price) * parseFloat(it.quantity))) || 0;
            if (it.is_addon && platos.length) {
                const p = platos[platos.length - 1];
                p.montoTotal += m;
                if (parseFloat(it.price) > 0) p.extras.push(it);
                continue;
            }
            platos.push({ ...it, montoTotal: m, extras: [] });
        }

        const porPuesto = new Map();
        for (const p of platos) {
            const k = p.seat || null;
            if (!porPuesto.has(k)) porPuesto.set(k, { seat: k, platos: [], total: 0 });
            const g = porPuesto.get(k);
            g.platos.push(p);
            g.total += p.montoTotal;
        }
        return [...porPuesto.values()].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    }, [cuenta?.items]);

    const tienePuestos = grupos.length > 1 || (grupos.length === 1 && grupos[0].seat !== null);

    const totalConsumo = useMemo(() => {
        return parseFloat(cuenta?.total) || grupos.reduce((acc, g) => acc + g.total, 0);
    }, [cuenta?.total, grupos]);

    const montoServicio = useMemo(() => {
        if (customTip !== "") {
            const raw = Math.max(0, parseFloat(String(customTip).replace(",", ".")) || 0);
            if (!(raw > 0)) return 0;
            if (tipCurrency === "local" && tasaLocal > 0) {
                return round2(raw / tasaLocal);
            }
            return round2(raw);
        }
        return servicePct > 0 ? round2(totalConsumo * (servicePct / 100)) : 0;
    }, [totalConsumo, servicePct, customTip, tipCurrency, tasaLocal]);

    const totalConServicio = round2(totalConsumo + montoServicio);

    if (!open || !cuenta) return null;

    const customer = cuenta.customer?.name || cuenta.customer_name || "Cliente General";
    const customerRif = cuenta.customer?.rif || cuenta.customer_rif || "";
    const waiter = cuenta.waiter_name || cuenta.employee_name || "";

    const handleImprimir = () => {
        setImprimiendo(true);
        try {
            printPrecuenta({
                cuenta,
                mesa: table,
                companyInfo,
                printerWidth,
                sym,
                local: local && tasaLocal > 0 ? { symbol: localSym, rate: tasaLocal } : null,
                servicio: montoServicio > 0 ? {
                    monto: montoServicio,
                    pct: customTip === "" && servicePct > 0 ? servicePct : null,
                } : null,
            });
            notify?.("Precuenta enviada a la impresora");
        } catch (err) {
            notify?.(err.message || "Error al imprimir la precuenta", "err");
        } finally {
            setTimeout(() => setImprimiendo(false), 800);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title={`Precuenta · ${table?.name || "Mesa"}`} width={460}>
            {/* Aviso "No es factura" */}
            <div className="flex items-center justify-between p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-2 text-[13px] font-bold">
                    <span>⚠️</span>
                    <span>Documento informativo · No es factura</span>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20">
                    Precuenta
                </span>
            </div>

            {/* Datos de mesa, fecha y cliente */}
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl p-4 mb-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between items-center">
                    <span className="text-content-subtle">Mesa:</span>
                    <span className="font-bold text-content dark:text-white">{table?.name || "Mesa"}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-content-subtle">Fecha y hora:</span>
                    <span className="font-semibold text-content dark:text-white tabular-nums">{fmtDate(cuenta.created_at || new Date())}</span>
                </div>
                {waiter && (
                    <div className="flex justify-between items-center">
                        <span className="text-content-subtle">Atiende:</span>
                        <span className="font-semibold text-content dark:text-white">{toNameCase(waiter)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-border/40 dark:border-white/[0.04]">
                    <span className="text-content-subtle">Cliente:</span>
                    <div className="text-right">
                        <span className="font-bold text-content dark:text-white block">{toNameCase(customer)}</span>
                        {customerRif && <span className="text-[11px] text-content-subtle block tabular-nums">{customerRif}</span>}
                    </div>
                </div>
            </div>

            {/* Desglose de platos agrupados por puesto */}
            <div className="space-y-2 mb-4 max-h-[36vh] overflow-y-auto pr-1">
                {grupos.map(g => (
                    <div key={g.seat ?? "mesa"} className="rounded-xl border border-border/60 dark:border-white/[0.06] p-3 bg-white dark:bg-surface-dark-2">
                        {tienePuestos && (
                            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border/40 dark:border-white/[0.04]">
                                <span className="text-[12px] font-bold text-brand-700 dark:text-brand-300">
                                    {g.seat ? `Puesto ${g.seat}` : "Mesa (compartido)"}
                                </span>
                                <span className="text-[12px] font-bold tabular-nums text-content dark:text-white">
                                    {fmtMoney(g.total, sym)}
                                </span>
                            </div>
                        )}
                        <ul className="divide-y divide-border/30 dark:divide-white/[0.03]">
                            {g.platos.map(p => (
                                <li key={p.id} className="py-1.5 flex items-start gap-2 text-[13px]">
                                    <span className="font-bold tabular-nums w-6 text-right shrink-0 text-brand-600 dark:text-brand-400">
                                        {fmtQty(p.quantity)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-content dark:text-white leading-snug">{p.name}</div>
                                        {p.extras.length > 0 && (
                                            <div className="text-[11px] text-content-subtle">
                                                {p.extras.map(x => `+ ${x.name}`).join(" · ")}
                                            </div>
                                        )}
                                        {p.note && (
                                            <div className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                                                {p.note}
                                            </div>
                                        )}
                                    </div>
                                    <span className="font-semibold tabular-nums text-content dark:text-white shrink-0">
                                        {fmtMoney(p.montoTotal, sym)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Propina / Servicio opcional en la precuenta */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 p-3.5 mb-3 space-y-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-content dark:text-white">Propina / Servicio</span>
                    <span className="text-[12px] font-semibold tabular-nums text-content-subtle">
                        {montoServicio > 0
                            ? `${fmtMoney(montoServicio, sym)}${customTip === "" && servicePct > 0 ? ` (${servicePct}%)` : ""}`
                            : "Sin propina"}
                    </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {[0, 10, 15, 20].map(pct => {
                        const on = customTip === "" && servicePct === pct;
                        return (
                            <button key={pct} type="button" onClick={() => { setCustomTip(""); setServicePct(pct); }}
                                className={`h-9 rounded-lg text-[12px] font-semibold border transition-all ${on
                                    ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                                    : "border-border dark:border-white/10 text-content dark:text-white"}`}>
                                {pct === 0 ? "0%" : `${pct}%`}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1.5">
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={customTip}
                        onChange={e => {
                            const v = e.target.value;
                            setCustomTip(v);
                            if (v !== "") setServicePct(null);
                            else setServicePct(0);
                        }}
                        placeholder={`Colocar monto de propina (${tipCurrency === "local" && tasaLocal > 0 ? localSym : sym})`}
                        className={`flex-1 min-w-0 h-9 px-3 rounded-lg border bg-surface-2/60 dark:bg-white/[0.04] text-[13px] font-semibold text-content dark:text-white placeholder:text-content-subtle/60 placeholder:font-normal focus:outline-none tabular-nums ${customTip !== ""
                            ? "border-brand-500 ring-2 ring-brand-500/20"
                            : "border-border dark:border-white/10 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"}`}
                    />
                    {tasaLocal > 0 ? (
                        <div className="flex rounded-lg overflow-hidden border border-border dark:border-white/10 shrink-0 h-9">
                            {[["base", sym], ["local", localSym]].map(([k, label]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setTipCurrency(k)}
                                    className={`px-2.5 text-[12px] font-bold transition-all ${tipCurrency === k
                                        ? "bg-brand-500/15 text-brand-700 dark:text-brand-300"
                                        : "bg-white dark:bg-white/[0.04] text-content-subtle"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <span className="h-9 px-2.5 rounded-lg border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.04] text-[12px] font-bold text-content-subtle flex items-center shrink-0">
                            {sym}
                        </span>
                    )}
                </div>
            </div>

            {/* Resumen de totales */}
            <div className="bg-surface-2/60 dark:bg-white/[0.03] rounded-2xl p-4 mb-4 border border-border/40 dark:border-white/[0.06] space-y-2">
                {montoServicio > 0 && (
                    <div className="space-y-1 pb-2 border-b border-border/40 dark:border-white/[0.04] text-[13px]">
                        <div className="flex justify-between items-center text-content-subtle">
                            <span>Consumo:</span>
                            <span className="font-semibold tabular-nums text-content dark:text-white">{fmtMoney(totalConsumo, sym)}</span>
                        </div>
                        <div className="flex justify-between items-center text-content-subtle">
                            <span>{customTip === "" && servicePct > 0 ? `Propina / Servicio (${servicePct}%):` : "Propina / Servicio:"}</span>
                            <span className="font-semibold tabular-nums text-content dark:text-white">{fmtMoney(montoServicio, sym)}</span>
                        </div>
                    </div>
                )}
                <div className="flex justify-between items-baseline">
                    <span className="text-[15px] font-bold text-content dark:text-white">
                        Total a pagar:
                    </span>
                    <div className="text-right">
                        <span className="text-[24px] font-extrabold tracking-tight tabular-nums text-content dark:text-white block leading-none">
                            {fmtMoney(totalConServicio, sym)}
                        </span>
                        {tasaLocal > 0 && (
                            <span className="text-[14px] font-semibold text-content-subtle tabular-nums mt-1 block">
                                ≈ {fmtMoney(totalConServicio * tasaLocal, localSym)}
                            </span>
                        )}
                    </div>
                </div>

                {tasaLocal > 0 && (
                    <div className="text-[11px] text-content-subtle text-right tabular-nums pt-1 border-t border-border/40 dark:border-white/[0.04]">
                        Tasa del día: 1 {sym} = {fmtMoney(tasaLocal, localSym)}
                    </div>
                )}
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2.5">
                <button type="button" onClick={onClose}
                    className="btn-outline h-12 px-5 rounded-xl text-[14px] font-semibold w-1/3">
                    Cerrar
                </button>
                <button type="button" onClick={handleImprimir} disabled={imprimiendo}
                    className="btn-accent h-12 px-5 rounded-xl text-[14px] font-bold flex-1 inline-flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    {imprimiendo ? "Imprimiendo…" : "Imprimir ticket térmico"}
                </button>
            </div>
        </Modal>
    );
}
