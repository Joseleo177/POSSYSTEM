import { useRef, useEffect } from "react";
import Modal from "../ui/Modal";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

// Mismo lenguaje visual que QuantityModal del POS: cabecera con foto, chips de unidad y
// existencia, y control grande con -/+. Aquí el resumen no es un subtotal sino la
// diferencia contra lo que había, que es el dato que importa al cuadrar inventario.
export default function EditStockModal({ editStockModal, onClose, editStockValue, setEditStockValue, submitEditStock }) {
    const inputRef = useRef(null);
    const intUnit = isIntegerUnit(editStockModal?.unit);

    useEffect(() => {
        if (editStockModal) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [editStockModal]);

    if (!editStockModal) return null;

    const unit = (editStockModal.unit || "UNIDAD").toUpperCase();
    const current = parseFloat(editStockModal.qty) || 0;
    const parsed = parseFloat(String(editStockValue).replace(",", "."));
    const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    const diff = parseFloat((next - current).toFixed(3));

    // La coma se normaliza a punto al guardar el valor: submitEditStock hace parseFloat
    // directo, y "6,5" se habría truncado a 6. En unidades contables no hay decimales.
    const handleChange = (val) => {
        let v = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
        if (intUnit) v = v.replace(/\..*$/, "");
        else {
            const parts = v.split(".");
            if (parts.length > 2) return;
            if (parts[1]?.length > 3) v = `${parts[0]}.${parts[1].slice(0, 3)}`;
        }
        setEditStockValue(v);
    };

    const adjust = (amount) => {
        let n = Math.max(0, next + amount);
        if (intUnit) n = Math.floor(n);
        setEditStockValue(String(parseFloat(n.toFixed(3))));
    };

    return (
        <Modal open={!!editStockModal} onClose={onClose} title={`Ajustar: ${editStockModal.product_name}`} width={440}>
            <form onSubmit={submitEditStock}>
                <div className="flex flex-col gap-4 py-1">

                    {/* Cabecera del producto */}
                    <div className="flex gap-4 items-center bg-surface-2 dark:bg-white/5 rounded-xl p-3 border border-border/30 dark:border-white/5">
                        <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-surface-3 dark:bg-black/20 border border-border/20 dark:border-white/5 relative">
                            {editStockModal.image_url ? (
                                <img
                                    src={resolveImageUrl(editStockModal.image_url)}
                                    alt={editStockModal.product_name}
                                    onError={imgRetryOnError}
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-brand-500/30">
                                    {editStockModal.product_name?.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            {editStockModal.category_name && (
                                <div className="text-[9px] font-black text-brand-500 uppercase tracking-widest truncate">
                                    {editStockModal.category_name}
                                </div>
                            )}
                            <div className="text-sm font-black dark:text-white uppercase tracking-wide leading-tight line-clamp-2">
                                {editStockModal.product_name}
                            </div>
                        </div>
                    </div>

                    {/* Unidad y existencia actual */}
                    <div className="flex justify-center items-center gap-2">
                        <div className="px-3 py-1 rounded-md bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 text-[9px] font-black uppercase tracking-widest border border-border/40 dark:border-white/5">
                            {unit}
                        </div>
                        <div className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            current <= 0 ? "bg-danger/10 text-danger border-danger/30"
                            : current <= 5 ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                            : "bg-success/10 text-success border-success/30"
                        }`}>
                            En sistema: {fmtQtyUnit(current, editStockModal.unit)}
                        </div>
                    </div>

                    {/* Control principal */}
                    <div className="flex items-center justify-between gap-4 px-1">
                        <button
                            type="button"
                            onClick={() => adjust(-1)}
                            className="w-12 h-12 rounded-lg bg-surface-2 dark:bg-white/5 flex items-center justify-center text-xl font-black text-content dark:text-white active:scale-95 transition-all border border-border/40 dark:border-white/5 shadow-sm hover:bg-surface-3 dark:hover:bg-white/10"
                        >
                            -
                        </button>

                        <div className="flex-1 relative group">
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="decimal"
                                value={editStockValue}
                                onChange={e => handleChange(e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-full bg-transparent text-center text-4xl font-display font-black dark:text-white border-none outline-none focus:ring-0 placeholder:opacity-20 tabular-nums"
                                placeholder="0"
                            />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-brand-500 rounded-full opacity-40 group-focus-within:opacity-100 transition-all" />
                        </div>

                        <button
                            type="button"
                            onClick={() => adjust(1)}
                            className="w-12 h-12 rounded-lg bg-brand-500 text-black flex items-center justify-center text-xl font-black active:scale-95 transition-all shadow-md shadow-brand-500/10 hover:brightness-105"
                        >
                            +
                        </button>
                    </div>

                    {/* Diferencia contra lo registrado: evita tener que restar de cabeza
                        para saber cuánto sobra o falta respecto al conteo físico. */}
                    <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border ${
                        diff === 0 ? "border-border/40 dark:border-white/10 bg-surface-2 dark:bg-white/[0.03]"
                        : diff > 0 ? "border-success/30 bg-success/5"
                        : "border-danger/30 bg-danger/5"
                    }`}>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40">
                                Diferencia
                            </span>
                            <span className="text-[10px] font-black uppercase text-content-muted tabular-nums">
                                {fmtQtyUnit(current, editStockModal.unit)} <span className="opacity-40">→</span> {fmtQtyUnit(next, editStockModal.unit)}
                            </span>
                        </div>
                        <span className={`text-lg font-black font-display tabular-nums leading-none ${
                            diff === 0 ? "text-content-subtle" : diff > 0 ? "text-success" : "text-danger"
                        }`}>
                            {diff === 0 ? "Sin cambios" : `${diff > 0 ? "+" : ""}${diff}`}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                        <button
                            type="submit"
                            className="w-full h-11 bg-brand-500 text-black rounded-lg font-black text-[11px] uppercase tracking-wider shadow-md shadow-brand-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 hover:brightness-105"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            Guardar Existencia
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full h-8 text-content-subtle dark:text-content-dark-muted rounded-lg font-black uppercase tracking-widest text-[9px] hover:bg-surface-2 dark:hover:bg-white/5 transition-all"
                        >
                            Cancelar (ESC)
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
