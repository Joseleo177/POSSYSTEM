import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import { fmtQtyUnit } from "../../helpers/unitFormatter";

export default function QuantityModal({ isOpen, onClose, item, onSave, convertToDisplay, convertToSecondary, currSym, secondaryCurrency, fmt }) {
    const [val, setVal] = useState("");
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && item) {
            setVal(String(item.qty || "").replace(".", ","));
            setError(null);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [isOpen, item]);

    if (!isOpen || !item) return null;

    const unit = (item.unit || "UNIDAD").toUpperCase();
    const isInteger = !["KG", "LITRO", "METRO", "L", "M"].includes(unit) || !!item.is_combo || !!item.is_service;

    const handleSave = () => {
        let clean = val.replace(/\s/g, "").replace(",", ".");
        let num = parseFloat(clean);
        if (isNaN(num)) return setError("Escribe una cantidad");
        if (isInteger) num = Math.floor(num);
        // Confirmar en cero dejaba la línea en el carrito sumando nada: no se cobra —el cierre
        // la descarta— pero se queda ahí ocupando sitio y haciendo dudar de si se cobró o no.
        // Para sacar un producto está la X de su fila.
        if (num <= 0) return setError("La cantidad debe ser mayor que cero");

        const ok = onSave(item.id, parseFloat(num.toFixed(3)));
        if (ok !== false) {
            setError(null);
            onClose();
        } else {
            setError("Stock insuficiente o límite alcanzado");
        }
    };

    const adjust = (amount) => {
        const current = parseFloat(val.replace(",", ".")) || 0;
        let next = Math.max(0, current + amount);
        if (isInteger) next = Math.floor(next);
        setVal(String(parseFloat(next.toFixed(3))).replace(".", ","));
        setError(null);
    };

    const handleInputChange = (raw) => {
        let v = raw.replace(/[^0-9.,]/g, "");
        if (isInteger) {
            v = v.replace(/[.,]/g, "");
        } else {
            const parts = v.split(/[.,]/);
            if (parts.length > 2) return;
            if (parts[1] && parts[1].length > 3) {
                v = parts[0] + (v.includes(",") ? "," : ".") + parts[1].slice(0, 3);
            }
        }
        setVal(v);
        setError(null);
    };

    const primaryPrice = convertToDisplay ? fmt(convertToDisplay(item.price), currSym) : null;
    const secondaryPrice = secondaryCurrency && convertToSecondary
        ? fmt(convertToSecondary(item.price), secondaryCurrency.symbol)
        : null;

    // Importe de la línea según lo que hay escrito ahora mismo. Mismo redondeo por línea
    // que CartContext (round2 del precio en la moneda mostrada × qty) para que coincida
    // con lo que se verá en el carrito. Las promociones no entran aquí: se aplican después.
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
    const qtyNum = (() => {
        const n = parseFloat(val.replace(",", "."));
        if (isNaN(n) || n < 0) return 0;
        return isInteger ? Math.floor(n) : n;
    })();
    const lineTotal = convertToDisplay ? round2(convertToDisplay(item.price)) * qtyNum : null;
    const lineTotalSecondary = secondaryCurrency && convertToSecondary
        ? round2(convertToSecondary(item.price)) * qtyNum
        : null;

    return (
        <Modal open={isOpen} onClose={onClose} title={`Cantidad: ${item.name}`} width={440}>
            <div className="flex flex-col gap-4 py-1 relative">

                {/* Product header: image + info */}
                <div className="flex gap-4 items-center bg-surface-2 dark:bg-white/5 rounded-xl p-3 border border-border/30 dark:border-white/5">
                    <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-surface-3 dark:bg-black/20 border border-border/20 dark:border-white/5">
                        {item.image_url ? (
                            <img
                                src={resolveImageUrl(item.image_url)}
                                alt={item.name}
                                onError={imgRetryOnError}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-20 dark:text-white">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        {item.category_name && (
                            <div className="text-[9px] font-black text-brand-500 uppercase tracking-widest truncate">
                                {item.category_name}
                            </div>
                        )}
                        <div className="text-sm font-black dark:text-white uppercase tracking-wide leading-tight line-clamp-2">
                            {item.name}
                        </div>
                        {primaryPrice && (
                            <div className="text-xl font-black dark:text-white font-display leading-none mt-0.5 tabular-nums">
                                {primaryPrice}
                                {secondaryPrice && (
                                    <span className="text-base text-content-muted dark:text-white/60"> · {secondaryPrice}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg animate-in slide-in-from-top-1 fade-in duration-150">
                        <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <span className="text-red-600 dark:text-red-400 text-[11px] font-bold uppercase tracking-wider">{error}</span>
                    </div>
                )}

                <div className="flex justify-center items-center gap-2">
                    <div className="px-3 py-1 rounded-md bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 text-[9px] font-black uppercase tracking-widest border border-border/40 dark:border-white/5">
                        {unit}
                    </div>
                    {/* Disponible: mismo semáforo que la grilla (no aplica a servicios/stock ilimitado) */}
                    {!item.is_service && item.stock !== null && item.stock !== undefined && (
                        <div className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            parseFloat(item.stock) <= 0 ? "bg-danger/10 text-danger border-danger/30"
                            : parseFloat(item.stock) <= 5 ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                            : "bg-success/10 text-success border-success/30"
                        }`}>
                            Dispo: {fmtQtyUnit(item.stock, item.unit)}
                        </div>
                    )}
                </div>

                {/* Main Input Control */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4 px-1">
                        <button
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
                                value={val}
                                onChange={e => handleInputChange(e.target.value)}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleSave();
                                    }
                                }}
                                className="w-full bg-transparent text-center text-4xl font-display font-black dark:text-white border-none outline-none focus:ring-0 placeholder:opacity-20 tabular-nums"
                                placeholder="0"
                            />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-brand-500 rounded-full opacity-40 group-focus-within:opacity-100 transition-all" />
                        </div>

                        <button
                            onClick={() => adjust(1)}
                            className="w-12 h-12 rounded-lg bg-brand-500 text-black flex items-center justify-center text-xl font-black active:scale-95 transition-all shadow-md shadow-brand-500/10 hover:brightness-105"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* Importe resultante: se recalcula al escribir o al usar +/-. */}
                {primaryPrice && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-brand-500/5 border border-brand-500/20">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40">Subtotal</span>
                            <span className="text-[10px] font-black uppercase text-brand-500 tabular-nums">
                                {fmtQtyUnit(qtyNum, item.unit)} <span className="opacity-40">×</span> {primaryPrice}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black font-display text-content dark:text-white tabular-nums leading-tight">
                                {fmt(lineTotal, currSym)}
                            </span>
                            {lineTotalSecondary !== null && (
                                <span className="text-lg font-black font-display text-content dark:text-white tabular-nums leading-tight">
                                    {fmt(lineTotalSecondary, secondaryCurrency.symbol)}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                    <button
                        onClick={handleSave}
                        className="w-full h-11 bg-brand-500 text-black rounded-lg font-black text-[11px] uppercase tracking-wider shadow-md shadow-brand-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 hover:brightness-105"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        Confirmar Cantidad
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full h-8 text-content-subtle dark:text-content-dark-muted rounded-lg font-black uppercase tracking-widest text-[9px] hover:bg-surface-2 dark:hover:bg-white/5 transition-all"
                    >
                        Cerrar (ESC)
                    </button>
                </div>
            </div>
        </Modal>
    );
}
