import { useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { toNameCase } from "../../helpers";

// Pagos que los clientes reportan desde el catálogo (ver services/paymentReports.js en el
// backend). Una sola pieza para las tres pantallas que los muestran: la caja al cobrar el
// pedido, las cuentas en espera y Contabilidad → Pagos reportados.

export const REPORT_STATUS = {
    pendiente:  { label: "Por confirmar", tone: "warning", flag: true },
    confirmado: { label: "Confirmado", tone: "success" },
    aplicado:   { label: "Cobrado", tone: "success", quiet: "check" },
    rechazado:  { label: "Rechazado", tone: "danger" },
};

const fecha = (d) => d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("es-VE", { day: "numeric", month: "short" }).replace(".", "") : "";

// Qué dice la tienda de este pago, en una línea: de dónde salió la confirmación o por qué no.
function detalle(r) {
    if (r.status === "rechazado") return r.reject_reason ? `Rechazado: ${r.reject_reason}` : null;
    if (r.confirmed_via === "extracto") return `Está en el extracto del ${fecha(r.line_date)}`;
    if (r.confirmed_via === "manual") return `Confirmado por ${toNameCase(r.reviewer_name || "la tienda")}`;
    if (r.status === "pendiente") return "Todavía no aparece en ningún extracto";
    return null;
}

function RejectDialog({ report, onClose, onDone }) {
    const { notify } = useApp();
    const [reason, setReason] = useState("");
    const enviar = async () => {
        try {
            await api.paymentReports.reject(report.id, reason);
            notify("Pago rechazado. El cliente verá el motivo en su pedido.");
            onDone();
        } catch (e) { notify(e.message, "err"); }
    };
    return (
        <Modal open={!!report} onClose={onClose} title="Rechazar pago" width={440}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button variant="ghost" className="h-12 sm:h-9" onClick={onClose}>Cancelar</Button>
                    <Button variant="danger" className="h-12 sm:h-9" onClick={enviar} disabled={reason.trim().length < 3}>Rechazar pago</Button>
                </div>
            }>
            <p className="text-[13px] text-content-muted dark:text-white/70 leading-relaxed mb-4">
                {report?.method_name} · Ref. {report?.reference_number} por <Money value={`${report?.currency_symbol} ${report?.amount?.toFixed(2)}`} className="font-semibold text-content dark:text-white" />.
                El pedido vuelve a quedar por pagar.
            </p>
            <label className="block">
                <span className="text-[12px] font-medium text-content-subtle">Motivo · lo verá el cliente</span>
                <input value={reason} onChange={e => setReason(e.target.value.slice(0, 200))} autoComplete="off" data-autofocus
                    placeholder="Ej. No aparece en el banco con esa referencia"
                    className="w-full h-10 mt-1.5 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            </label>
        </Modal>
    );
}

/**
 * Lista de pagos reportados con sus acciones. `onApply(report)`: registrar el confirmado como
 * cobro (solo la caja, al cobrar el pedido). `showOrder`: mostrar cliente y pedido en cada fila
 * (en la lista general sí; dentro de un pedido sobra).
 */
export default function PaymentReportList({ reports, onChanged, onApply = null, showOrder = false }) {
    const { notify, can } = useApp();
    const [rechazar, setRechazar] = useState(null);
    const puedeConfirmar = can("accounting.confirm");

    const confirmar = async (r) => {
        try {
            await api.paymentReports.confirm(r.id);
            notify("Pago confirmado");
            onChanged?.();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <>
            <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                {reports.map(r => {
                    const nota = detalle(r);
                    const enBs = r.currency_is_base === false;
                    return (
                        <div key={r.id} className={`px-4 py-3 ${r.status === "pendiente" ? "shadow-[inset_3px_0_0_#f59e0b]" : ""}`}>
                            {showOrder && (
                                <div className="flex items-baseline justify-between gap-3 mb-0.5">
                                    <span className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(r.customer_name || "Cliente")}</span>
                                    <span className="text-[12px] text-content-subtle tabular-nums shrink-0">
                                        {r.invoice_number || (r.sale_id ? `Pedido #${r.sale_id}` : "Pedido eliminado")}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[13px] font-medium text-content dark:text-white min-w-0 truncate">
                                    {r.method_name}{r.bank_name ? ` · ${r.bank_name}` : ""}
                                </span>
                                <Money value={`${r.currency_symbol} ${r.amount.toFixed(2)}`} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-3">
                                <span className="text-[12px] text-content-subtle tabular-nums truncate">
                                    Ref. {r.reference_number} · {fecha(r.reference_date)}
                                    {r.payer_bank ? <span className="hidden sm:inline"> · desde {r.payer_bank}</span> : null}
                                    {enBs && <span className="hidden sm:inline"> · Ref. {r.amount_base.toFixed(2)}</span>}
                                </span>
                                <StatusMark status={r.status} map={REPORT_STATUS} />
                            </div>
                            {nota && <p className={`mt-1 text-[12px] ${r.status === "rechazado" ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>{nota}</p>}

                            {r.status === "pendiente" && puedeConfirmar && (
                                <div className="mt-2.5 flex flex-col sm:flex-row sm:justify-end gap-2">
                                    <Button variant="ghost" className="h-12 sm:h-8" onClick={() => setRechazar(r)}>Rechazar</Button>
                                    <Button className="h-12 sm:h-8" onClick={() => confirmar(r)}>Confirmar: está en el banco</Button>
                                </div>
                            )}
                            {r.status === "pendiente" && !puedeConfirmar && (
                                <p className="mt-1 text-[12px] text-content-subtle">Lo confirma un encargado en Contabilidad → Pagos reportados.</p>
                            )}
                            {r.status === "confirmado" && (onApply || puedeConfirmar) && (
                                <div className="mt-2.5 flex flex-col sm:flex-row sm:justify-end gap-2">
                                    {puedeConfirmar && <Button variant="ghost" className="h-12 sm:h-8" onClick={() => setRechazar(r)}>Rechazar</Button>}
                                    {onApply && <Button className="h-12 sm:h-8" onClick={() => onApply(r)}>Registrar este pago</Button>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {rechazar && (
                <RejectDialog report={rechazar} onClose={() => setRechazar(null)} onDone={() => { setRechazar(null); onChanged?.(); }} />
            )}
        </>
    );
}
