import React from "react";

/**
 * Componente de rango de fechas estandarizado para el sistema
 * @param {string} from - Fecha inicial (YYYY-MM-DD)
 * @param {string} to - Fecha final (YYYY-MM-DD)
 * @param {function} setFrom - Setter para fecha inicial
 * @param {function} setTo - Setter para fecha final
 * @param {string} className - Clases adicionales para el contenedor
 */
export default function DateRangePicker({ from, to, setFrom, setTo, className = "" }) {
    return (
        <div className={`relative flex items-center gap-2 bg-surface-2 dark:bg-white/5 px-3 h-8 rounded-lg border border-border/30 dark:border-white/10 transition-all hover:border-brand-500/30 ${className}`}>
            {/* Icono de Calendario */}
            <svg className="w-3.5 h-3.5 text-content-subtle opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>

            <div className="flex items-center gap-2 flex-1">
                {/* Input Desde */}
                <div className="relative flex-1 group/input">
                    <input
                        type="date"
                        value={from}
                        onChange={e => setFrom?.(e.target.value)}
                        className="bg-transparent border-none text-[11px] font-bold text-content dark:text-white p-0 focus:ring-0 w-full cursor-pointer appearance-none"
                        title="Fecha Inicial"
                    />
                </div>

                {/* Separador */}
                <span className="text-content-subtle opacity-30 text-[10px] font-black shrink-0">→</span>

                {/* Input Hasta */}
                <div className="relative flex-1 group/input">
                    <input
                        type="date"
                        value={to}
                        onChange={e => setTo?.(e.target.value)}
                        className="bg-transparent border-none text-[11px] font-bold text-content dark:text-white p-0 focus:ring-0 w-full cursor-pointer appearance-none"
                        title="Fecha Final"
                    />
                </div>
            </div>

            {/* Boton limpiar (solo si hay fechas) */}
            {(from || to) && (
                <button 
                    onClick={() => { setFrom?.(""); setTo?.(""); }}
                    className="ml-1 w-4 h-4 rounded-full flex items-center justify-center hover:bg-danger/10 text-content-subtle hover:text-danger transition-colors"
                    title="Limpiar fechas"
                >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                input[type="date"]::-webkit-calendar-picker-indicator {
                    background: transparent;
                    bottom: 0;
                    color: transparent;
                    cursor: pointer;
                    height: auto;
                    left: 0;
                    position: absolute;
                    right: 0;
                    top: 0;
                    width: auto;
                }
            `}} />
        </div>
    );
}
