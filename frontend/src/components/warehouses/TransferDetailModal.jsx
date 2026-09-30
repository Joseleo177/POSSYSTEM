import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import StatusMark from "../ui/StatusMark";
import { toNameCase } from "../../helpers";
import { fmtDateShort, fmtTime } from "../../helpers/dates";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { printTransferNote } from "../../helpers/printTransferNote";
import { printTransferNoteLetter } from "../../helpers/printTransferNoteLetter";
import { TRANSFER_STATUS } from "./TransfersView";

// Qué se hace con lo que se despachó y nunca llegó.
const RESOLUTIONS = [
    { value: "loss",   label: "Merma: se da por perdido" },
    { value: "return", label: "Apareció: vuelve al origen" },
];

const cuando = (d) => d ? `${fmtDateShort(d)} · ${fmtTime(d)}` : "";
const cant = (n, unit) => fmtQtyUnit(n, unit).toLowerCase();

// Un paso del recorrido del documento: punto, qué pasó, quién y cuándo, y la nota si la hay.
function Paso({ tone = "done", title, who, when, note, last }) {
    const dot = {
        done:    "bg-content dark:bg-white",
        pending: "bg-amber-500 ring-4 ring-amber-500/20",
        void:    "bg-content-subtle/50",
    }[tone];
    return (
        <li className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className="absolute left-[4px] top-3 bottom-0 w-px bg-border dark:bg-white/10" />}
            <span className={`relative mt-[5px] w-[9px] h-[9px] rounded-full shrink-0 ${dot}`} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13px] font-semibold text-content dark:text-white">{title}</span>
                    {when && <span className="text-[12px] text-content-subtle tabular-nums">{when}</span>}
                </div>
                {who && <div className="text-[12px] text-content-subtle">{who}</div>}
                {note && <div className="mt-1 text-[12px] text-content-muted dark:text-white/70 leading-relaxed border-l-2 border-border dark:border-white/10 pl-2.5">{note}</div>}
            </div>
        </li>
    );
}

export default function TransferDetailModal({
    open, transfer, onClose, onResolve, onCancel, saving,
    canManage, companyInfo, printerWidth,
}) {
    const [resolutions, setResolutions] = useState({});
    const [cancelMode, setCancelMode]   = useState(false);
    const [cancelReason, setCancelReason] = useState("");

    useEffect(() => {
        if (!open) return;
        setResolutions({});
        setCancelMode(false);
        setCancelReason("");
    }, [open, transfer?.id]);

    if (!transfer) return null;

    const items = transfer.items || [];
    const pendingDiff = transfer.difference_status === "pending";
    const unitComun = items.every(i => (i.unit || "") === (items[0]?.unit || "")) ? items[0]?.unit : null;

    const missingLines = items.filter(i =>
        i.qty_received != null && parseFloat(i.qty_sent) - parseFloat(i.qty_received) > 0 && !i.resolved_at);
    const allResolved = missingLines.every(l => resolutions[l.id]);

    const submitResolve = () => onResolve(transfer.id, missingLines.map(l => ({
        id: l.id,
        resolution: resolutions[l.id],
    })));

    const totalSent = items.reduce((s, i) => s + (parseFloat(i.qty_sent) || 0), 0);
    const recibido = items.some(i => i.qty_received != null);
    const totalReceived = items.reduce((s, i) => s + (parseFloat(i.qty_received) || 0), 0);
    const destino = toNameCase(transfer.to_warehouse_name);

    return (
        <Modal open={open} onClose={onClose} title={transfer.code || `Transferencia #${transfer.id}`} width={680}>
            <div className="space-y-5">
                {/* ── Ruta ── */}
                <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <StatusMark status={transfer.status} map={TRANSFER_STATUS} />
                        {pendingDiff && <span className="text-[12px] font-medium text-red-600 dark:text-red-400">Faltante sin resolver</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="min-w-0">
                            <div className="text-[12px] text-content-subtle">Origen</div>
                            <div className="text-[17px] font-semibold tracking-tight text-content dark:text-white truncate">
                                {transfer.from_warehouse_name ? toNameCase(transfer.from_warehouse_name) : "Externo"}
                            </div>
                        </div>
                        <span className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.06] border border-border/70 dark:border-white/10 flex items-center justify-center text-content-muted dark:text-white/60">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </span>
                        <div className="min-w-0 text-right">
                            <div className="text-[12px] text-content-subtle">Destino</div>
                            <div className="text-[17px] font-semibold tracking-tight text-content dark:text-white truncate">{destino}</div>
                        </div>
                    </div>
                </div>

                {/* ── Recorrido ── */}
                <ol className="px-1">
                    <Paso title="Despachada"
                        who={toNameCase(transfer.employee_name) || "Sistema"}
                        when={cuando(transfer.dispatched_at || transfer.created_at)}
                        note={transfer.note} />
                    {transfer.received_at ? (
                        <Paso title={transfer.status === "received_with_differences" ? "Recibida con faltantes" : "Recibida"}
                            who={toNameCase(transfer.received_by_name) || "—"}
                            when={cuando(transfer.received_at)}
                            note={transfer.receipt_note} last />
                    ) : transfer.cancelled_at ? (
                        <Paso tone="void" title="Anulada: todo volvió al origen"
                            who={toNameCase(transfer.cancelled_by_name) || "—"}
                            when={cuando(transfer.cancelled_at)}
                            note={transfer.cancel_reason} last />
                    ) : (
                        <Paso tone="pending" title="En tránsito" who={`Falta que ${destino} cuente y confirme lo que llegó`} last />
                    )}
                </ol>

                {/* ── Productos: despachado contra recibido ── */}
                <div className="rounded-xl border border-border/70 dark:border-white/[0.06] overflow-hidden">
                    <div className="px-4 h-9 bg-surface-2 dark:bg-white/[0.03] border-b border-border/70 dark:border-white/[0.06] grid grid-cols-[1fr_7rem_7rem] gap-3 items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-content-subtle">
                        <span>Producto</span>
                        <span className="text-right">Despachado</span>
                        <span className="text-right">Recibido</span>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto custom-scrollbar divide-y divide-border/50 dark:divide-white/[0.04]">
                        {items.map(i => {
                            const sent     = parseFloat(i.qty_sent);
                            const received = i.qty_received == null ? null : parseFloat(i.qty_received);
                            const missing  = received == null ? 0 : sent - received;
                            return (
                                <div key={i.id} className="px-4 py-2.5 grid grid-cols-[1fr_7rem_7rem] gap-3 items-center">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-content dark:text-white truncate">{i.product_name}</p>
                                        {missing > 0 && (
                                            <p className="text-[12px] text-red-600 dark:text-red-400 truncate">
                                                Faltan {cant(missing, i.unit)}
                                                {i.diff_reason ? ` · ${i.diff_reason}` : ""}
                                                {i.resolved_at ? ` · ${i.diff_resolution === "return" ? "volvió al origen" : "cargado como merma"}` : ""}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-[13px] tabular-nums text-right text-content dark:text-white">{cant(sent, i.unit)}</span>
                                    <span className={`text-[13px] tabular-nums text-right inline-flex items-center justify-end gap-1 ${
                                        received == null ? "text-content-subtle" : missing > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-content dark:text-white"}`}>
                                        {received != null && missing <= 0 && (
                                            <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        )}
                                        {received == null ? "—" : cant(received, i.unit)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {items.length > 1 && (
                        <div className="px-4 py-2.5 bg-surface-2 dark:bg-white/[0.03] border-t border-border/70 dark:border-white/[0.06] grid grid-cols-[1fr_7rem_7rem] gap-3 items-center text-[13px]">
                            <span className="text-content-subtle">{items.length} productos</span>
                            <span className="text-right font-semibold tabular-nums text-content dark:text-white">{unitComun ? cant(totalSent, unitComun) : totalSent.toLocaleString("es-VE", { maximumFractionDigits: 3 })}</span>
                            <span className="text-right font-semibold tabular-nums text-content dark:text-white">{recibido ? (unitComun ? cant(totalReceived, unitComun) : totalReceived.toLocaleString("es-VE", { maximumFractionDigits: 3 })) : "—"}</span>
                        </div>
                    )}
                </div>

                {/* ── Resolver faltantes ── */}
                {pendingDiff && missingLines.length > 0 && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] overflow-hidden">
                        <div className="px-4 pt-3 pb-2">
                            <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">Faltantes por resolver</p>
                            <p className="text-[12px] text-content-subtle mt-0.5 leading-relaxed">
                                Salieron del origen y no entraron al destino. Si se dio por perdido queda como merma;
                                si apareció, vuelve a contar en el origen.
                            </p>
                        </div>
                        <div className="divide-y divide-red-500/10">
                            {missingLines.map(l => {
                                const missing = parseFloat(l.qty_sent) - parseFloat(l.qty_received);
                                return (
                                    <div key={l.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-content dark:text-white truncate">{l.product_name}</p>
                                            <p className="text-[12px] text-red-600 dark:text-red-400">Faltan {cant(missing, l.unit)}</p>
                                        </div>
                                        <CustomSelect
                                            value={resolutions[l.id] || ""}
                                            onChange={val => setResolutions(prev => ({ ...prev, [l.id]: val }))}
                                            options={RESOLUTIONS}
                                            placeholder="¿Qué pasó?"
                                            className="sm:w-60"
                                            height="h-9"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        {canManage && (
                            <div className="px-4 py-3 border-t border-red-500/10">
                                <Button variant="primary" onClick={submitResolve} disabled={!allResolved || saving} className="h-9 px-5 text-[13px] w-full">
                                    {saving ? "Guardando…" : "Resolver faltantes"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Anulación (solo en tránsito) ── */}
                {canManage && transfer.status === "sent" && cancelMode && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4 space-y-3">
                        <div>
                            <p className="text-[13px] font-semibold text-red-700 dark:text-red-300">Anular transferencia</p>
                            <p className="text-[12px] text-content-subtle mt-0.5 leading-relaxed">
                                Todo lo despachado vuelve al almacén de origen. El documento queda anulado en el historial; no se borra.
                            </p>
                        </div>
                        <textarea
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            placeholder="Motivo de la anulación"
                            className="input min-h-[64px] py-2.5 px-3 resize-none text-[13px] leading-relaxed"
                            rows={2}
                            data-autofocus
                        />
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setCancelMode(false)} className="h-9 px-4 text-[13px] flex-1">Volver</Button>
                            <Button variant="danger" onClick={() => onCancel(transfer.id, cancelReason)} disabled={saving || !cancelReason.trim()} className="h-9 px-4 text-[13px] flex-1">
                                {saving ? "Anulando…" : "Confirmar anulación"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <div className="flex gap-2">
                    {/* Dos papeles distintos: el rollo viaja grapado al bulto, la hoja carta
                        se archiva y se envía. El mismo documento, no dos versiones. */}
                    <Button variant="ghost" onClick={() => printTransferNote(transfer, companyInfo, printerWidth)}
                        className="h-9 px-3.5 text-[13px]" title="Nota de despacho en rollo térmico">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Térmica
                    </Button>
                    <Button variant="ghost" onClick={() => printTransferNoteLetter(transfer, companyInfo)}
                        className="h-9 px-3.5 text-[13px]" title="Nota de despacho en tamaño carta, para guardar como PDF">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        PDF
                    </Button>
                </div>
                <div className="flex gap-2">
                    {canManage && transfer.status === "sent" && !cancelMode && (
                        <button onClick={() => setCancelMode(true)}
                            className="h-9 px-3.5 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors">
                            Anular
                        </button>
                    )}
                    <Button variant="ghost" onClick={onClose} className="h-9 px-5 text-[13px]">Cerrar</Button>
                </div>
            </div>
        </Modal>
    );
}
