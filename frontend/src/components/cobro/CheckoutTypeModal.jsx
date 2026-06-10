import { useState, useEffect } from "react";

const OPTIONS = [
    {
        key: "factura",
        num: "1",
        title: "Factura",
        desc: "Genera la factura y registra la venta en el inventario",
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
    },
    {
        key: "cotizacion",
        num: "2",
        title: "Cotización",
        desc: "Guarda el presupuesto sin afectar el inventario",
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
        ),
    },
];

export default function CheckoutTypeModal({ open, onClose, onSelectFactura, onSelectCotizacion }) {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
        if (open) setSelected(0);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const handler = (e) => {
            if (e.key === "1") { e.preventDefault(); e.stopPropagation(); setSelected(0); }
            if (e.key === "2") { e.preventDefault(); e.stopPropagation(); setSelected(1); }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp")   { e.preventDefault(); e.stopPropagation(); setSelected(0); }
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setSelected(1); }
            if (e.key === "Enter") {
                e.preventDefault(); e.stopPropagation();
                if (selected === 0) onSelectFactura();
                else onSelectCotizacion();
            }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
        };

        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, selected, onSelectFactura, onSelectCotizacion, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out" onKeyDown={e => e.stopPropagation()}>

                <div className="text-center mb-5">
                    <div className="w-12 h-12 rounded-[16px] bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-black uppercase tracking-wide">¿Cómo deseas procesar?</h2>
                    <p className="text-[10px] text-content-subtle mt-1 font-medium">
                        Presiona <kbd className="px-1 py-0.5 rounded bg-surface-2 dark:bg-white/10 font-mono text-[9px]">1</kbd> o <kbd className="px-1 py-0.5 rounded bg-surface-2 dark:bg-white/10 font-mono text-[9px]">2</kbd> para navegar · <kbd className="px-1 py-0.5 rounded bg-surface-2 dark:bg-white/10 font-mono text-[9px]">Enter</kbd> para confirmar
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    {OPTIONS.map((opt, idx) => {
                        const isSelected = selected === idx;
                        return (
                            <button
                                key={opt.key}
                                onClick={() => { setSelected(idx); }}
                                onDoubleClick={() => idx === 0 ? onSelectFactura() : onSelectCotizacion()}
                                className={[
                                    "rounded-xl border-2 p-4 text-left transition-all flex flex-col gap-2 relative",
                                    isSelected
                                        ? "border-brand-500 bg-brand-500/10"
                                        : "border-border/30 dark:border-white/10 hover:border-brand-500/40 dark:hover:border-brand-500/30",
                                ].join(" ")}
                            >
                                <span className={`absolute top-2 right-2 text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md ${isSelected ? "bg-brand-500 text-black" : "bg-surface-2 dark:bg-white/10 text-content-subtle"}`}>
                                    {opt.num}
                                </span>
                                <span className={isSelected ? "text-brand-500" : "text-content-subtle"}>
                                    {opt.icon}
                                </span>
                                <div>
                                    <div className={`text-[12px] font-black uppercase tracking-tight ${isSelected ? "text-brand-500" : "text-content dark:text-white"}`}>
                                        {opt.title}
                                    </div>
                                    <div className="text-[10px] text-content-subtle mt-0.5 leading-snug">
                                        {opt.desc}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={onClose}
                        className="h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => selected === 0 ? onSelectFactura() : onSelectCotizacion()}
                        className="h-10 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 transition-all"
                    >
                        {selected === 0 ? "Crear Factura" : "Crear Cotización"}
                    </button>
                </div>
            </div>
        </div>
    );
}
