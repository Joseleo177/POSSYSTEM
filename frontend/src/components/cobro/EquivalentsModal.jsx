import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import StatusMark, { PRESCRIPTION_STATUS } from "../ui/StatusMark";
import { api } from "../../services/api";
import { separarPrincipios } from "../../helpers/principios";

/**
 * Equivalentes de un medicamento en la caja (módulo Farmacia).
 *
 * Dos grupos (23-11-2026), que vienen separados del servidor (productService.getEquivalents):
 *   - Equivalentes: exactamente los mismos principios activos. Se venden en su lugar.
 *   - "También contienen …": combinaciones que lo incluyen y llevan algo más (Loratadina +
 *     Pseudoefedrina para quien pidió Loratadina). No son lo mismo: se muestran aparte, con lo
 *     que llevan de más en ámbar, y decide el farmacéutico.
 */
function Fila({ eq, onAdd, convertToDisplay, currSym, fmt }) {
    const sinStock = parseFloat(eq.stock || 0) <= 0;
    return (
        <div className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${sinStock
            ? "border-border/40 dark:border-white/5 opacity-60 bg-surface-2/40 dark:bg-white/[0.02]"
            : "border-border/70 dark:border-white/10 bg-white dark:bg-white/[0.03]"}`}>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-content dark:text-white uppercase truncate">{eq.name}</span>
                    {(eq.prescription_type === "controlado" || eq.prescription_type === "recipe") && (
                        <StatusMark status={eq.prescription_type} map={PRESCRIPTION_STATUS} />
                    )}
                </div>
                {eq.adicionales?.length > 0 && (
                    <div className="mt-1 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                        Lleva además: {eq.adicionales.join(" + ")}
                    </div>
                )}
                <div className="text-[12px] text-content-subtle mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    {eq.concentration && <span>{eq.concentration}</span>}
                    {eq.brand && <span>· Lab: {eq.brand}</span>}
                    {eq.shelf_location && <span>· Anaquel: {eq.shelf_location}</span>}
                </div>
                <div className="text-[12px] mt-1 font-semibold">
                    <span className={sinStock ? "text-danger" : "text-content dark:text-white"}>
                        {sinStock ? "Agotado" : `Disponible: ${parseFloat(eq.stock || 0)} ${eq.unit || "und"}`}
                    </span>
                </div>
            </div>
            <button
                type="button"
                disabled={sinStock}
                onClick={() => onAdd(eq)}
                className="shrink-0 h-12 sm:h-9 px-3.5 rounded-lg text-[12px] font-bold bg-brand-500 text-brand-ink hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
                + Agregar · {fmt(convertToDisplay(eq.price), currSym)}
            </button>
        </div>
    );
}

export default function EquivalentsModal({
    open, onClose, product, warehouseId,
    onAddUnit,
    convertToDisplay, currSym, fmt,
}) {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [combinaciones, setCombinaciones] = useState([]);
    const [principios, setPrincipios] = useState([]);

    useEffect(() => {
        if (!open || !product?.id) return;
        let alive = true;
        setLoading(true);
        api.products.equivalents(product.id, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!alive) return;
                setItems(r.data || []);
                setCombinaciones(r.combinaciones || []);
                setPrincipios(r.principios || separarPrincipios(r.active_ingredient || product.active_ingredient));
            })
            .catch(() => { if (alive) { setItems([]); setCombinaciones([]); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [open, product?.id, product?.active_ingredient, warehouseId]);

    if (!open || !product) return null;

    const agregar = (eq) => { onAddUnit(eq); onClose(); };
    const props = { onAdd: agregar, convertToDisplay, currSym, fmt };
    const nombre = principios.join(" + ");

    return (
        <Modal open={open} onClose={onClose} title={`Equivalentes de ${product.name}`} width={640}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-content-subtle mr-1">{principios.length > 1 ? "Principios activos" : "Principio activo"}</span>
                    {principios.length ? principios.map(p => (
                        <span key={p} className="h-7 px-2.5 rounded-lg bg-surface-2 dark:bg-white/[0.06] border border-border/70 dark:border-white/10 text-[12px] font-semibold text-content dark:text-white inline-flex items-center">{p}</span>
                    )) : <span className="text-[12px] text-content-subtle">No indicado</span>}
                    {product.concentration && <span className="text-[12px] text-content-subtle ml-1">· {product.concentration}</span>}
                </div>

                {loading ? (
                    <div className="py-10 text-center text-[13px] text-content-subtle animate-pulse">Buscando equivalentes en esta sucursal…</div>
                ) : (
                    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
                        <section>
                            <div className="mb-2">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Equivalentes</div>
                                <div className="text-[12px] text-content-subtle">Mismos principios activos: se pueden vender en su lugar.</div>
                            </div>
                            {items.length === 0 ? (
                                <div className="py-6 text-center text-[13px] text-content-subtle border border-dashed border-border/60 dark:border-white/10 rounded-xl">
                                    No hay otros medicamentos con {principios.length > 1 ? "esta misma combinación" : "el mismo principio activo"}.
                                </div>
                            ) : (
                                <div className="space-y-2">{items.map(eq => <Fila key={eq.id} eq={eq} {...props} />)}</div>
                            )}
                        </section>

                        {combinaciones.length > 0 && (
                            <section>
                                <div className="mb-2">
                                    <div className="text-[14px] font-semibold text-content dark:text-white">También contienen {nombre}</div>
                                    <div className="text-[12px] text-content-subtle">Combinaciones con otro principio más. No son lo mismo: confirma con el farmacéutico si le sirven al paciente.</div>
                                </div>
                                <div className="space-y-2">{combinaciones.map(eq => <Fila key={eq.id} eq={eq} {...props} />)}</div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
