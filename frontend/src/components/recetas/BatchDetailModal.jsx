import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase, fmtDateShort } from "../../helpers";
import { fmtRinde, fmtTanda } from "./shared";
import { Rinde } from "./ProduccionView";

// Detalle de una tanda (OP-0001): qué se usó frente a lo que pedía la receta, cuánto salió y a
// cuánto. Anularla devuelve los insumos y retira lo que salió.

export default function BatchDetailModal({ batchId, onClose, onChanged }) {
    const { notify, baseCurrency, can } = useApp();
    const money = (n) => fmtBase(n, baseCurrency);
    const [b, setB] = useState(null);
    const [annulling, setAnnulling] = useState(false);
    const open = batchId != null;

    useEffect(() => {
        if (!open) return;
        setB(null);
        let vivo = true;
        api.production.batch(batchId)
            .then(r => { if (vivo) setB(r.data); })
            .catch(e => { if (vivo) { notify(e?.message || "No se pudo abrir la producción", "err"); onClose?.(); } });
        return () => { vivo = false; };
    }, [batchId]);

    const anulada = b?.status === "anulada";
    const puedeAnular = b && !anulada && can("production.manage");
    const hora = (d) => new Date(d).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

    return (
        <>
            <Modal open={open} onClose={annulling ? () => {} : onClose} title={b ? `${b.code} · ${toNameCase(b.product_name)}` : "Producción"} width={640}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        {puedeAnular && (
                            <button type="button" onClick={() => setAnnulling(true)}
                                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-red-500/25 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors sm:mr-auto">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Anular producción
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cerrar</button>
                    </div>
                }>
                {!b ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-4">
                        {anulada && (
                            <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-[12px] text-red-700 dark:text-red-300">
                                Anulada{b.annulled_at ? ` el ${fmtDateShort(b.annulled_at)} a las ${hora(b.annulled_at)}` : ""}. Los insumos volvieron al almacén y lo que salió se retiró.
                            </div>
                        )}
                        <dl className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium text-content-subtle">Salió</dt>
                                <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white"><Rinde b={b} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium text-content-subtle">Costo total</dt>
                                <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white tabular-nums"><Money value={money(b.total_cost)} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium text-content-subtle">Por {b.unit === "PORCION" ? "porción" : "unidad"}</dt>
                                <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white tabular-nums"><Money value={money(b.unit_cost)} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[11px] font-medium text-content-subtle">Fecha y sucursal</dt>
                                <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white tabular-nums">{fmtDateShort(b.created_at)}</dd>
                                <dd className="text-[11px] text-content-subtle truncate mt-0.5">{hora(b.created_at)} · {b.warehouse_name}</dd>
                            </div>
                        </dl>

                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-surface-2/30 dark:bg-white/[0.02] p-3.5 space-y-2.5">
                            <div className="text-[13px] font-semibold text-content dark:text-white">
                                Lo que se usó {b.batches !== 1 && <span className="text-content-subtle font-normal">({String(b.batches).replace(".", ",")} tandas)</span>}
                            </div>
                            <div className="rounded-lg border border-border/70 dark:border-white/[0.07] overflow-hidden bg-white dark:bg-[#12141a]/60">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_6rem] gap-3 items-center px-3 py-2 bg-surface-2 dark:bg-white/[0.03] border-b border-border/60 dark:border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.06em] text-content-subtle">
                                    <span>Insumo</span>
                                    <span className="text-right">Cantidad usada</span>
                                    <span className="text-right">Costo</span>
                                </div>
                                <div className="divide-y divide-border/50 dark:divide-white/[0.05]">
                                    {b.lines.map(l => {
                                        const distinto = l.expected_qty != null && Math.abs(l.actual_qty - l.expected_qty) > 0.0005;
                                        return (
                                            <div key={l.product_id} className="px-3 py-2.5 grid grid-cols-[minmax(0,1fr)_auto_6rem] gap-3 items-center">
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(l.name)}</div>
                                                    {(l.expected_qty == null || distinto) && (
                                                        <div className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                                                            {l.expected_qty == null ? "Extra fuera de la receta" : `La receta pedía ${fmtTanda(l.expected_qty, l.unit)}`}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-right text-[13px] font-medium text-content dark:text-white tabular-nums whitespace-nowrap">
                                                    {fmtTanda(l.actual_qty, l.unit)}
                                                </span>
                                                <Money value={money(l.cost)} className="text-right text-[13px] font-semibold text-content dark:text-white tabular-nums" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {(b.notes || b.employee_name) && (
                            <div className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/40 dark:bg-white/[0.02] px-4 py-2.5 text-[12px] text-content-subtle space-y-1">
                                {b.employee_name && <p>Registrado por <span className="font-semibold text-content dark:text-white">{toNameCase(b.employee_name)}</span>.</p>}
                                {b.notes && <p className="text-content dark:text-white">{b.notes}</p>}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={annulling}
                title={`Anular ${b?.code || "producción"}`}
                message={b ? `Vuelven a la sucursal los insumos que se usaron y se retiran ${fmtRinde(b.actual_yield, b.unit)} de ${toNameCase(b.product_name)}. Si ya se vendieron, la existencia queda en negativo.` : ""}
                confirmText="Anular"
                onCancel={() => setAnnulling(false)}
                onConfirm={async () => {
                    try {
                        const r = await api.production.annulBatch(b.id);
                        notify(`${b.code} anulada`);
                        setB(r.data);
                        setAnnulling(false);
                        onChanged?.();
                    } catch (e) { notify(e?.message || "No se pudo anular", "err"); }
                }}
            />
        </>
    );
}
