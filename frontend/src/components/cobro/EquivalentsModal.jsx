import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import StatusMark, { PRESCRIPTION_STATUS } from "../ui/StatusMark";
import { api } from "../../services/api";

export default function EquivalentsModal({
    open, onClose, product, warehouseId,
    onAddUnit,
    convertToDisplay, currSym, fmt,
}) {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [ingredient, setIngredient] = useState("");

    useEffect(() => {
        if (!open || !product?.id) return;
        let alive = true;
        setLoading(true);
        api.products.equivalents(product.id, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!alive) return;
                setItems(r.data || []);
                setIngredient(r.active_ingredient || product.active_ingredient || "");
            })
            .catch(() => { if (alive) setItems([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [open, product?.id, product?.active_ingredient, warehouseId]);

    if (!open || !product) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Equivalentes de ${product.name}`}
            width={620}
        >
            <div className="space-y-3">
                <div className="px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-[12px] text-brand-700 dark:text-brand-300 flex items-center justify-between gap-2">
                    <span>Principio activo: <strong>{ingredient || "No indicado"}</strong></span>
                    {product.concentration && <span className="opacity-80">{product.concentration}</span>}
                </div>

                {loading ? (
                    <div className="py-10 text-center text-[12px] text-content-subtle animate-pulse">
                        Buscando equivalentes en esta sucursal...
                    </div>
                ) : items.length === 0 ? (
                    <div className="py-10 text-center text-[12px] text-content-subtle border border-dashed border-border/60 dark:border-white/10 rounded-xl">
                        No hay otros medicamentos registrados con el mismo principio activo.
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                        {items.map(eq => {
                            const sinStock = parseFloat(eq.stock || 0) <= 0;
                            return (
                                <div
                                    key={eq.id}
                                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${sinStock
                                        ? "border-border/40 dark:border-white/5 opacity-60 bg-surface-2/40 dark:bg-white/[0.02]"
                                        : "border-border/70 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-brand-500/50"}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[13px] font-bold text-content dark:text-white uppercase truncate">{eq.name}</span>
                                            {(eq.prescription_type === "controlado" || eq.prescription_type === "recipe") && (
                                                <StatusMark status={eq.prescription_type} map={PRESCRIPTION_STATUS} />
                                            )}
                                        </div>
                                        <div className="text-[11.5px] text-content-subtle mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                                            {eq.concentration && <span>{eq.concentration}</span>}
                                            {eq.brand && <span>· Lab: {eq.brand}</span>}
                                            {eq.shelf_location && <span>· Anaquel: {eq.shelf_location}</span>}
                                        </div>
                                        <div className="text-[11.5px] mt-1 font-semibold">
                                            <span className={sinStock ? "text-danger" : "text-success"}>
                                                Stock: {parseFloat(eq.stock || 0)} {eq.unit || "und"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            disabled={sinStock}
                                            onClick={() => { onAddUnit(eq); onClose(); }}
                                            className="px-3.5 py-2 rounded-lg text-[12px] font-bold bg-brand-500 text-brand-ink hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            + Agregar · {fmt(convertToDisplay(eq.price), currSym)}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
    );
}
