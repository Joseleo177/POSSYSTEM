import { useState } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import Money from "../ui/Money";
import AddonPicker, { faltante, precioExtras } from "../mesas/AddonPicker";

// Ficha rápida de un plato con adicionales (término, contorno, extras) en el catálogo público,
// para los temas que agregan con un toque. Igual que el selector de tallas: se abre desde
// "Agregar" y no se puede pedir el plato sin elegir lo obligatorio. Los grupos vienen ya en el
// producto (getProducts los trae), así que no hay otra consulta. El tema de menú usa su propia
// ficha (ProductAddModal), que lleva el mismo selector.
export default function AddonChooserModal({ product, onClose, onPick, fmt, baseCur, altCur }) {
    const [opciones, setOpciones] = useState([]);
    const [nota, setNota] = useState("");
    const [qty, setQty] = useState(1);

    if (!product) return null;

    const falta = faltante(product.addons, opciones);
    const unidad = (parseFloat(product.price) || 0) + precioExtras(opciones);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label={product.name}
                className="relative w-full sm:max-w-md max-h-[90vh] bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col z-10">
                <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                </div>

                <div className="px-5 pt-3 sm:pt-5 pb-4 flex items-start gap-3.5 shrink-0">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] shrink-0">
                        {product.image_url && <img src={resolveImageUrl(product.image_url)} alt={product.name} onError={imgRetryOnError} className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2 className="text-[16px] font-semibold tracking-tight text-content dark:text-white leading-snug">{product.name}</h2>
                        {product.short_description && <p className="text-[13px] text-content-subtle leading-snug mt-0.5">{product.short_description}</p>}
                        <Money value={fmt(product.price, baseCur)} className="block mt-1.5 text-[20px] font-bold tracking-tight text-content dark:text-white" />
                        {altCur && <Money value={fmt(product.price, altCur)} className="block text-[12px] text-content-subtle" />}
                    </div>
                    <button onClick={onClose} aria-label="Cerrar"
                        className="w-9 h-9 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
                    <AddonPicker groups={product.addons} value={opciones} onChange={setOpciones} sym={baseCur?.symbol || "Ref."} />
                    <label className="block">
                        <span className="text-[12px] font-medium text-content-subtle">Nota <span className="font-normal">· opcional</span></span>
                        <textarea value={nota} onChange={e => setNota(e.target.value)} maxLength={200} rows={2}
                            placeholder="Algo más que debamos saber"
                            className="w-full mt-1.5 px-3 py-2.5 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white outline-none focus:border-brand-500 resize-none" />
                    </label>
                </div>

                <div className="shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/60 dark:border-white/[0.06] flex items-center gap-3">
                    <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Quitar uno"
                            className="w-11 h-11 rounded-xl border border-border dark:border-white/10 text-content dark:text-white text-lg font-semibold disabled:opacity-30">−</button>
                        <span className="w-8 text-center text-[16px] font-bold text-content dark:text-white tabular-nums">{qty}</span>
                        <button type="button" onClick={() => setQty(q => q + 1)} aria-label="Agregar uno"
                            className="w-11 h-11 rounded-xl border border-border dark:border-white/10 text-content dark:text-white text-lg font-semibold">+</button>
                    </div>
                    <button onClick={() => { onPick(product, qty, nota, opciones); onClose(); }} disabled={!!falta}
                        className="flex-1 h-12 rounded-xl bg-brand-500 text-white text-[15px] font-semibold disabled:bg-surface-3 disabled:text-content-subtle dark:disabled:bg-white/[0.06] disabled:cursor-not-allowed active:scale-[0.99] transition truncate px-3">
                        {falta ? `Elige ${falta.name.toLowerCase()}` : `Agregar · ${fmt(unidad * qty, baseCur)}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
