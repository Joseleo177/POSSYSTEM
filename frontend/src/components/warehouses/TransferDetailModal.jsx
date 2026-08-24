import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import { fmtDate } from "../../helpers";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { printTransferNote } from "../../helpers/printTransferNote";
import { printTransferNoteLetter } from "../../helpers/printTransferNoteLetter";
import { STATUS_META } from "./TransfersView";

// Qué se hace con lo que se despachó y nunca llegó.
const RESOLUTIONS = [
    { value: "loss",   label: "Merma — se da por perdido" },
    { value: "return", label: "Apareció / vuelve al origen" },
];

const Row = ({ label, children }) => (
    <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle whitespace-nowrap">{label}</span>
        <span className="text-[11px] font-black uppercase tracking-tight text-right">{children}</span>
    </div>
);

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

    const meta  = STATUS_META[transfer.status] || STATUS_META.sent;
    const items = transfer.items || [];
    const pendingDiff = transfer.difference_status === "pending";

    const missingLines = items.filter(i =>
        i.qty_received != null && parseFloat(i.qty_sent) - parseFloat(i.qty_received) > 0 && !i.resolved_at);
    const allResolved = missingLines.every(l => resolutions[l.id]);

    const submitResolve = () => onResolve(transfer.id, missingLines.map(l => ({
        id: l.id,
        resolution: resolutions[l.id],
    })));

    return (
        <Modal open={open} onClose={onClose} title={transfer.code || `Transferencia #${transfer.id}`} width={640}>
            <div className="space-y-4 p-1">
                {/* ── Cabecera del documento ── */}
                <div className="rounded-xl border border-border/30 dark:border-white/10 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Estado</span>
                        <span className={`badge ${meta.badge} shadow-none text-[10px]`}>{meta.label}</span>
                    </div>
                    <Row label="Ruta">
                        {transfer.from_warehouse_name || "Externo"} <span className="text-content-subtle">&rarr;</span>{" "}
                        <span className="text-brand-500">{transfer.to_warehouse_name}</span>
                    </Row>
                    <Row label="Despachó">
                        {transfer.employee_name || "Sistema"}
                        <span className="block text-[10px] font-bold text-content-subtle tabular-nums normal-case">
                            {fmtDate(transfer.dispatched_at || transfer.created_at)}
                        </span>
                    </Row>
                    {transfer.received_at && (
                        <Row label="Recibió">
                            {transfer.received_by_name || "—"}
                            <span className="block text-[10px] font-bold text-content-subtle tabular-nums normal-case">
                                {fmtDate(transfer.received_at)}
                            </span>
                        </Row>
                    )}
                    {transfer.cancelled_at && (
                        <Row label="Anuló">
                            {transfer.cancelled_by_name || "—"}
                            <span className="block text-[10px] font-bold text-content-subtle tabular-nums normal-case">
                                {fmtDate(transfer.cancelled_at)}
                            </span>
                        </Row>
                    )}
                    {(transfer.note || transfer.receipt_note || transfer.cancel_reason) && (
                        <div className="pt-2 border-t border-border/20 dark:border-white/5 space-y-1.5">
                            {transfer.note && (
                                <p className="text-[10px] font-medium italic text-content-subtle leading-relaxed">
                                    Despacho: {transfer.note}
                                </p>
                            )}
                            {transfer.receipt_note && (
                                <p className="text-[10px] font-medium italic text-content-subtle leading-relaxed">
                                    Recepción: {transfer.receipt_note}
                                </p>
                            )}
                            {transfer.cancel_reason && (
                                <p className="text-[10px] font-medium italic text-danger leading-relaxed">
                                    Anulación: {transfer.cancel_reason}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Líneas: despachado contra recibido ── */}
                <div className="rounded-xl border border-border/30 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-2 bg-surface-2/50 dark:bg-white/[0.03] grid grid-cols-[1fr_auto_auto] gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Producto</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle w-24 text-right">Despachado</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle w-24 text-right">Recibido</span>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto divide-y divide-border/10 dark:divide-white/5">
                        {items.map(i => {
                            const sent     = parseFloat(i.qty_sent);
                            const received = i.qty_received == null ? null : parseFloat(i.qty_received);
                            const missing  = received == null ? 0 : sent - received;
                            return (
                                <div key={i.id} className="px-4 py-2.5">
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                                        <p className="text-[11px] font-black uppercase tracking-tight truncate">{i.product_name}</p>
                                        <span className="text-[11px] font-black tabular-nums w-24 text-right">{fmtQtyUnit(sent, i.unit)}</span>
                                        <span className={`text-[11px] font-black tabular-nums w-24 text-right ${
                                            received == null ? "text-content-subtle opacity-50" : missing > 0 ? "text-danger" : "text-success"
                                        }`}>
                                            {received == null ? "En tránsito" : fmtQtyUnit(received, i.unit)}
                                        </span>
                                    </div>
                                    {missing > 0 && (
                                        <p className="text-[9px] font-black uppercase tracking-wide text-danger mt-1">
                                            Faltan {fmtQtyUnit(missing, i.unit)}
                                            {i.diff_reason ? ` · ${i.diff_reason}` : ""}
                                            {i.resolved_at ? ` · ${i.diff_resolution === "return" ? "Devuelto al origen" : "Cargado como merma"}` : ""}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Resolver faltantes ── */}
                {pendingDiff && missingLines.length > 0 && (
                    <div className="rounded-xl border border-danger/25 bg-danger/5 overflow-hidden">
                        <div className="px-4 py-2.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-danger">Faltantes por resolver</p>
                            <p className="text-[10px] font-medium text-content-subtle mt-1 leading-relaxed">
                                Esta mercancía salió del origen y no entró al destino. Decide qué pasó con cada una:
                                si se dio por perdida queda como merma, si apareció vuelve a contar en el origen.
                            </p>
                        </div>
                        <div className="divide-y divide-danger/10">
                            {missingLines.map(l => {
                                const missing = parseFloat(l.qty_sent) - parseFloat(l.qty_received);
                                return (
                                    <div key={l.id} className="px-4 py-2.5 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-tight truncate">{l.product_name}</p>
                                            <p className="text-[9px] font-bold text-danger">Faltan {fmtQtyUnit(missing, l.unit)}</p>
                                        </div>
                                        <CustomSelect
                                            value={resolutions[l.id] || ""}
                                            onChange={val => setResolutions(prev => ({ ...prev, [l.id]: val }))}
                                            options={RESOLUTIONS}
                                            placeholder="Qué se hace..."
                                            className="w-56"
                                            height="h-9"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        {canManage && (
                            <div className="px-4 py-3 border-t border-danger/10">
                                <Button
                                    variant="primary"
                                    onClick={submitResolve}
                                    disabled={!allResolved || saving}
                                    className="h-9 px-5 font-black tracking-widest text-[10px] uppercase w-full"
                                >
                                    {saving ? "Guardando..." : "Resolver faltantes"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Anulación (solo en tránsito) ── */}
                {canManage && transfer.status === "sent" && (
                    cancelMode ? (
                        <div className="rounded-xl border border-danger/25 bg-danger/5 p-3.5 space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-danger">Anular transferencia</p>
                            <p className="text-[10px] font-medium text-content-subtle leading-relaxed">
                                Todo lo despachado vuelve al almacén origen. La transferencia queda anulada en el
                                histórico: no se borra.
                            </p>
                            <textarea
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                                placeholder="Motivo de la anulación..."
                                className="input min-h-[60px] py-3 px-3 resize-none text-[11px] leading-relaxed"
                                rows={2}
                            />
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => setCancelMode(false)} className="h-9 px-4 font-black tracking-widest text-[10px] uppercase flex-1">
                                    Volver
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={() => onCancel(transfer.id, cancelReason)}
                                    disabled={saving || !cancelReason.trim()}
                                    className="h-9 px-4 font-black tracking-widest text-[10px] uppercase flex-1"
                                >
                                    {saving ? "Anulando..." : "Confirmar anulación"}
                                </Button>
                            </div>
                        </div>
                    ) : null
                )}
            </div>

            <div className="flex justify-between gap-3 mt-6 pt-5 border-t border-border/10 dark:border-white/5">
                <div className="flex gap-2">
                    {/* Dos papeles distintos: el rollo viaja grapado al bulto, la hoja carta
                        se archiva y se envía. El mismo documento, no dos versiones. */}
                    <Button
                        variant="ghost"
                        onClick={() => printTransferNote(transfer, companyInfo, printerWidth)}
                        className="h-10 px-4 font-black tracking-widest text-[10px] uppercase"
                        title="Nota de despacho en rollo térmico"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Térmica
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => printTransferNoteLetter(transfer, companyInfo)}
                        className="h-10 px-4 font-black tracking-widest text-[10px] uppercase"
                        title="Nota de despacho en tamaño carta, para guardar como PDF"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        PDF
                    </Button>
                    {canManage && transfer.status === "sent" && !cancelMode && (
                        <Button
                            variant="ghost"
                            onClick={() => setCancelMode(true)}
                            className="h-10 px-4 font-black tracking-widest text-[10px] uppercase text-danger hover:bg-danger/10"
                        >
                            Anular
                        </Button>
                    )}
                </div>
                <Button variant="primary" onClick={onClose} className="h-10 px-8 font-black tracking-[0.2em] text-[10px] uppercase">
                    Cerrar
                </Button>
            </div>
        </Modal>
    );
}
