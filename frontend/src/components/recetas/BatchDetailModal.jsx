import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase, fmtDateShort } from "../../helpers";
import { CARD } from "../fabrica/shared";
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
                            <button onClick={() => setAnnulling(true)} className="h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400 sm:mr-auto">
                                Anular producción
                            </button>
                        )}
                        <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
                    </div>
                }>
                {!b ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-5">
                        {anulada && (
                            <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
                                Anulada{b.annulled_at ? ` el ${fmtDateShort(b.annulled_at)} a las ${hora(b.annulled_at)}` : ""}. Los insumos volvieron y lo que salió se retiró.
                            </div>
                        )}
                        <dl className={`${CARD} px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3`}>
                            <div className="min-w-0">
                                <dt className="text-[12px] text-content-subtle">Salió</dt>
                                <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white"><Rinde b={b} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[12px] text-content-subtle">Costo</dt>
                                <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white"><Money value={money(b.total_cost)} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[12px] text-content-subtle">Por {b.unit === "PORCION" ? "porción" : "unidad"}</dt>
                                <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white"><Money value={money(b.unit_cost)} /></dd>
                            </div>
                            <div className="min-w-0">
                                <dt className="text-[12px] text-content-subtle">Cuándo</dt>
                                <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtDateShort(b.created_at)}</dd>
                                <dd className="text-[12px] text-content-subtle truncate">{hora(b.created_at)} · {b.warehouse_name}</dd>
                            </div>
                        </dl>

                        <section>
                            <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">
                                Lo que se usó {b.batches !== 1 && <span className="text-content-subtle font-normal">({String(b.batches).replace(".", ",")} tandas)</span>}
                            </h3>
                            <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06]">
                                {b.lines.map(l => {
                                    const distinto = l.expected_qty != null && Math.abs(l.actual_qty - l.expected_qty) > 0.0005;
                                    return (
                                        <div key={l.product_id} className="py-2 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(l.name)}</div>
                                                <div className={`text-[12px] truncate ${distinto ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                    {fmtTanda(l.actual_qty, l.unit)}
                                                    {l.expected_qty == null ? " · no estaba en la receta" : distinto ? ` · la receta pedía ${fmtTanda(l.expected_qty, l.unit)}` : ""}
                                                </div>
                                            </div>
                                            <Money value={money(l.cost)} className="text-[13px] text-content dark:text-white shrink-0" />
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {(b.notes || b.employee_name) && (
                            <div className="text-[13px] text-content-subtle space-y-1">
                                {b.employee_name && <p>Registró {toNameCase(b.employee_name)}.</p>}
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
