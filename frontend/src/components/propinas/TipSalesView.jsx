import { useCallback, useEffect, useState } from "react";
import DateRangePicker from "../ui/DateRangePicker";
import CustomSelect from "../ui/CustomSelect";
import Money from "../ui/Money";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowCta } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { todayISO, toNameCase, fmtDateShort } from "../../helpers";

const COLS = 6;
const primeroDelMes = () => `${todayISO().slice(0, 8)}01`;
const fechaHora = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
};
const aQuien = (f) => (f.tip_pool ? "Pozo" : f.seller_name ? toNameCase(f.seller_name) : "Sin mesonero");

/**
 * Facturas con propina del período y a quién le tocó cada una. Quien tiene el permiso
 * tips.reassign la cambia de persona (o al pozo) aunque la factura ya esté cerrada; cada cambio
 * queda con quién lo hizo, cuándo y por qué.
 */
export default function TipSalesView({ version, onChanged }) {
    const { notify, can, baseCurrency, seleccionKey } = useApp();
    const [from, setFrom] = useState(primeroDelMes);
    const [to, setTo] = useState(todayISO);
    const [persona, setPersona] = useState("");
    const [personas, setPersonas] = useState([]);
    const [rows, setRows] = useState(null);
    const [cambiando, setCambiando] = useState(null);
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const puedeCambiar = can("tips.reassign");

    useEffect(() => {
        api.tips.staff(true).then(r => setPersonas(r.data || [])).catch(() => setPersonas([]));
    }, [version]);

    const cargar = useCallback(async () => {
        setRows(null);
        try {
            const r = await api.tips.sales({ date_from: from || "", date_to: to || "", ...(persona ? { seller_id: persona } : {}) });
            setRows(r.data || []);
        } catch (e) { notify(e.message, "err"); setRows([]); }
    }, [from, to, persona, notify]);

    useEffect(() => { cargar(); }, [cargar, version, seleccionKey]);

    const lista = rows || [];
    const total = lista.reduce((a, f) => a + f.tip, 0);

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="px-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} className="w-full sm:w-[260px]" />
                <CustomSelect value={persona} onChange={setPersona} className="w-full sm:w-[220px]" boxClassName="rounded-lg"
                    options={[{ value: "", label: "Todo el personal" }, ...personas.map(p => ({ value: String(p.id), label: toNameCase(p.name) }))]} />
                <p className="text-[12px] text-content-subtle sm:ml-auto tabular-nums">{lista.length} {lista.length === 1 ? "factura" : "facturas"} · {fmt(total)}</p>
            </div>

            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[150px]">Factura</th>
                                <th>Mesa o cliente</th>
                                <th className="w-[200px]">Atendió</th>
                                <th className="w-[200px]">Propina para</th>
                                <th className="w-[120px] text-right">Propina</th>
                                <th className="w-[120px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {!rows ? <LedgerSkeleton cols={COLS} rows={6} />
                                : lista.length === 0 ? (
                                    <LedgerEmpty cols={COLS} title="Sin propinas en el período"
                                        hint="Aparecen las facturas cobradas con el recargo marcado como propina." />
                                ) : lista.map(f => (
                                    <tr key={f.id} {...ledgerRow(puedeCambiar ? () => setCambiando(f) : undefined)}>
                                        <td className="pl-4">
                                            <div className="text-[13px] font-semibold tabular-nums text-content dark:text-white">{f.invoice_number || `#${f.id}`}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums">{fechaHora(f.created_at)}</div>
                                        </td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] text-content dark:text-white truncate">{f.table_name || toNameCase(f.customer_name) || "Sin cliente"}</div>
                                            {f.table_name && f.customer_name && <div className="text-[12px] text-content-subtle truncate">{toNameCase(f.customer_name)}</div>}
                                        </td>
                                        <td className="text-[13px] text-content-subtle truncate">{f.waiter_name ? toNameCase(f.waiter_name) : "Caja"}</td>
                                        <td>
                                            <div className={`text-[13px] font-semibold truncate ${!f.tip_pool && !f.seller_name ? "text-amber-700 dark:text-amber-400" : "text-content dark:text-white"}`}>{aQuien(f)}</div>
                                            {f.cambios > 0 && <div className="text-[12px] text-content-subtle">Corregida {f.cambios === 1 ? "1 vez" : `${f.cambios} veces`}</div>}
                                        </td>
                                        <td className="text-right"><Money value={fmt(f.tip)} className="text-[13px] font-semibold text-content dark:text-white" /></td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex items-center justify-end">
                                                {puedeCambiar && <RowCta onClick={() => setCambiando(f)}>Cambiar</RowCta>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="lg:hidden px-4 py-3 space-y-2">
                {!rows ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : lista.length === 0 ? (
                    <div className="py-14 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">Sin propinas en el período</div>
                        <div className="text-[13px] text-content-subtle mt-1">Aparecen las facturas cobradas con el recargo marcado como propina.</div>
                    </div>
                ) : lista.map(f => (
                    <div key={f.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold tabular-nums text-content dark:text-white truncate">{f.invoice_number || `#${f.id}`} <span className="font-normal text-content-subtle">· {f.table_name || toNameCase(f.customer_name) || "Sin cliente"}</span></span>
                            <Money value={fmt(f.tip)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                        </div>
                        <div className="mt-1.5 flex items-end justify-between gap-3">
                            <div className="min-w-0 text-[12px] text-content-subtle">
                                <div className="truncate tabular-nums">{fechaHora(f.created_at)} · atendió {f.waiter_name ? toNameCase(f.waiter_name) : "la caja"}</div>
                                <div className={`truncate ${!f.tip_pool && !f.seller_name ? "text-amber-700 dark:text-amber-400" : ""}`}>Para {aQuien(f)}{f.cambios ? " · corregida" : ""}</div>
                            </div>
                            {puedeCambiar && (
                                <button onClick={() => setCambiando(f)} className="btn-outline h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0">Cambiar</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {cambiando && (
                <ReasignarModal factura={cambiando} personas={personas.filter(p => p.active)} fmt={fmt}
                    onClose={() => setCambiando(null)}
                    onDone={() => { setCambiando(null); cargar(); onChanged?.(); }} />
            )}
        </div>
    );
}

// Cambiar a quién le toca la propina de una factura, con el historial de cambios.
function ReasignarModal({ factura, personas, fmt, onClose, onDone }) {
    const { notify } = useApp();
    const [destino, setDestino] = useState(factura.tip_pool ? "pozo" : (factura.tip_seller_id ? String(factura.tip_seller_id) : ""));
    const [motivo, setMotivo] = useState("");
    const [historial, setHistorial] = useState(null);

    useEffect(() => {
        api.tips.history(factura.id).then(r => setHistorial(r.data || [])).catch(() => setHistorial([]));
    }, [factura.id]);

    const actual = factura.tip_pool ? "pozo" : (factura.tip_seller_id ? String(factura.tip_seller_id) : "");
    const cambia = destino && destino !== actual;

    const guardar = async () => {
        try {
            await api.tips.reassign(factura.id, destino === "pozo"
                ? { to_pool: true, reason: motivo.trim() || undefined }
                : { tip_seller_id: parseInt(destino), reason: motivo.trim() || undefined });
            notify("Listo: la propina cambió de persona");
            onDone();
        } catch (e) { notify(e.message, "err"); }
    };

    const de = (h) => (h.from_pool ? "Pozo" : h.from_name ? toNameCase(h.from_name) : "Sin mesonero");
    const a = (h) => (h.to_pool ? "Pozo" : h.to_name ? toNameCase(h.to_name) : "Sin mesonero");

    return (
        <Modal open onClose={onClose} title="¿A quién le toca la propina?" width={520}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    {cambia && <Button className="h-12 sm:h-10 px-5" onClick={guardar}>Guardar el cambio</Button>}
                </div>
            }>
            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[14px] font-semibold tabular-nums text-content dark:text-white">{factura.invoice_number || `#${factura.id}`}</p>
                    <p className="text-[12px] text-content-subtle truncate">{fmtDateShort(factura.created_at)} · {factura.table_name || toNameCase(factura.customer_name) || "Sin cliente"} · atendió {factura.waiter_name ? toNameCase(factura.waiter_name) : "la caja"}</p>
                </div>
                <Money value={fmt(factura.tip)} className="text-[20px] font-bold tracking-tight text-content dark:text-white shrink-0" />
            </div>

            <div className="mt-4 space-y-4">
                <label className="block">
                    <span className="block text-[12px] text-content-subtle mb-1.5">Propina para</span>
                    <CustomSelect value={destino} onChange={setDestino} className="w-full" boxClassName="rounded-lg"
                        placeholder="Elegir persona"
                        options={[...personas.map(p => ({ value: String(p.id), label: toNameCase(p.name) })), { value: "pozo", label: "Pozo (se reparte entre todos)" }]} />
                </label>
                <label className="block">
                    <span className="flex items-baseline justify-between text-[12px] text-content-subtle mb-1.5">Por qué <span>Opcional</span></span>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} autoComplete="off"
                        placeholder="La atendió Ana, no Juan"
                        className="w-full h-12 sm:h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                </label>
                <p className="text-[12px] text-content-subtle leading-relaxed">
                    Pasa la propina entera de esta factura, también la que ya se cobró. Si ya se le había pagado a la otra persona, le queda en contra para su próximo pago.
                </p>
            </div>

            {historial && historial.length > 0 && (
                <div className="mt-5">
                    <p className="text-[14px] font-semibold text-content dark:text-white mb-2">Cambios anteriores</p>
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                        {historial.map(h => (
                            <div key={h.id} className="px-3.5 py-2.5">
                                <div className="text-[13px] text-content dark:text-white">{de(h)} → <span className="font-semibold">{a(h)}</span></div>
                                <div className="text-[12px] text-content-subtle truncate">
                                    {fechaHora(h.created_at)} · {h.employee_name ? toNameCase(h.employee_name) : "—"}{h.reason ? ` · ${h.reason}` : ""}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
}
