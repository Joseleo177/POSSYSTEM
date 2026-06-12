import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";

export default function QuantityModal({ isOpen, onClose, item, onSave }) {
    const [val, setVal] = useState("");
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && item) {
            setVal(String(item.qty || "").replace(".", ","));
            setError(null);
            // Foco explícito después de que React termine el render + setVal
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
        if (!isNaN(num) && num >= 0) {
            // Si es unidad, bulto, etc., forzamos entero
            if (isInteger) num = Math.floor(num);
            const ok = onSave(item.id, parseFloat(num.toFixed(3)));
            // Solo cerrar si el padre no rechazó (retorna false = stock insuficiente)
            if (ok !== false) {
                setError(null);
                onClose();
            } else {
                setError("Stock insuficiente o límite alcanzado");
            }
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
            v = v.replace(/[.,]/g, ""); // No permitir puntos ni comas
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

    return (
        <Modal open={isOpen} onClose={onClose} title={`Cantidad: ${item.name}`} width={380}>
            <div className="flex flex-col gap-4 py-1 relative">
            {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg animate-in slide-in-from-top-1 fade-in duration-150">
                    <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span className="text-red-600 dark:text-red-400 text-[11px] font-bold uppercase tracking-wider">{error}</span>
                </div>
            )}
                
                <div className="flex justify-center -mt-1">
                    <div className="px-3 py-1 rounded-md bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 text-[9px] font-black uppercase tracking-widest border border-border/40 dark:border-white/5">
                        {unit}
                    </div>
                </div>

                {/* Main Input Control */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4 px-1">
                        <button 
                            onClick={() => adjust(-1)}
                            className="w-10 h-10 rounded-lg bg-surface-2 dark:bg-white/5 flex items-center justify-center text-lg font-black text-content dark:text-white active:scale-95 transition-all border border-border/40 dark:border-white/5 shadow-sm hover:bg-surface-3 dark:hover:bg-white/10"
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
                                className="w-full bg-transparent text-center text-3xl font-display font-black dark:text-white border-none outline-none focus:ring-0 placeholder:opacity-20 tabular-nums"
                                placeholder="0"
                            />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-brand-500 rounded-full opacity-40 group-focus-within:opacity-100 transition-all" />
                        </div>

                        <button 
                            onClick={() => adjust(1)}
                            className="w-10 h-10 rounded-lg bg-brand-500 text-black flex items-center justify-center text-lg font-black active:scale-95 transition-all shadow-md shadow-brand-500/10 hover:brightness-105"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                    <button
                        onClick={handleSave}
                        className="w-full h-10 bg-brand-500 text-black rounded-lg font-black text-[11px] uppercase tracking-wider shadow-md shadow-brand-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 hover:brightness-105"
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
