import { useState, useEffect } from "react";
import Modal from "../ui/Modal";

/**
 * QuantityModal - Estandarizado con el sistema
 * Permite editar cantidades con botones gigantes compatibles con táctiles.
 */
export default function QuantityModal({ isOpen, onClose, item, onSave }) {
    const [val, setVal] = useState("");

    useEffect(() => {
        if (isOpen && item) {
            // Si el item viene del carrito tiene qty, si es nuevo del catálogo es vacío
            setVal(String(item.qty || "").replace(".", ","));
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
            if (ok !== false) onClose();
        }
    };

    const adjust = (amount) => {
        const current = parseFloat(val.replace(",", ".")) || 0;
        let next = Math.max(0, current + amount);
        if (isInteger) next = Math.floor(next);
        setVal(String(parseFloat(next.toFixed(3))).replace(".", ","));
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
    };

    return (
        <Modal open={isOpen} onClose={onClose} title={`Cantidad: ${item.name}`}>
            <div className="flex flex-col gap-6 py-2">
                
                {/* Visual Unit Badge */}
                <div className="flex justify-center">
                    <div className="px-4 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-[10px] font-black uppercase tracking-widest border border-brand-500/20">
                        Producto por {unit}
                    </div>
                </div>

                {/* Main Input Control */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-5 px-2">
                        <button 
                            onClick={() => adjust(-1)}
                            className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-xl font-black text-content dark:text-white active:scale-90 transition-all border border-black/5 dark:border-white/5 shadow-sm hover:bg-surface-3 dark:hover:bg-white/10"
                        >
                            -
                        </button>

                        <div className="flex-1 relative group">
                            <input
                                autoFocus
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
                                className="w-full bg-transparent text-center text-5xl font-display font-black dark:text-white border-none outline-none focus:ring-0 placeholder:opacity-20"
                                placeholder="0"
                            />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-16 h-1 bg-brand-500 rounded-full opacity-40 group-focus-within:opacity-100 transition-all animate-pulse" />
                        </div>

                        <button 
                            onClick={() => adjust(1)}
                            className="w-14 h-14 rounded-2xl bg-brand-500 text-brand-900 flex items-center justify-center text-xl font-black active:scale-90 transition-all shadow-lg shadow-brand-500/20 hover:brightness-110"
                        >
                            +
                        </button>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 pt-2">
                    <button
                        onClick={handleSave}
                        className="w-full h-14 bg-brand-500 text-brand-900 rounded-2xl font-black uppercase tracking-wider shadow-xl shadow-brand-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 hover:brightness-110"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        Confirmar Cantidad
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full h-10 text-content-subtle dark:text-content-dark-muted rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-surface-2 dark:hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </Modal>
    );
}
