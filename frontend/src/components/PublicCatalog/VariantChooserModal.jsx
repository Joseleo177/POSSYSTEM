import { useState, useEffect } from "react";
import { publicApi } from "../../services/api";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import Money from "../ui/Money";
import VariantOptions, { useVariantSelection, lineaDeVariante } from "./VariantOptions";

// Selector de talla y color que abre "Agregar" sobre un producto con variantes desde la
// rejilla, en cualquier tema. La ficha del producto lleva el mismo selector en línea (ver
// VariantOptions): aquí es la versión rápida, sin salir de la lista.
export default function VariantChooserModal({ token, branchId, product, onClose, onPick, fmt, baseCur, altCur }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!product) return;
        let vivo = true;
        setData(null); setError(null);
        publicApi.getProduct(token, product.id, { warehouse_id: branchId || "" })
            .then(r => { if (vivo) setData(r.data || r); })
            .catch(e => { if (vivo) setError(e.message || "No se pudo cargar el producto"); });
        return () => { vivo = false; };
    }, [product?.id, branchId, token]); // eslint-disable-line

    const v = useVariantSelection(data?.variants, product?.id);

    if (!product) return null;

    const precio = v.elegida ? v.elegida.price : product.price;
    const foto = v.foto || product.image_url;

    const agregar = () => {
        if (!v.elegida?.available) return;
        onPick(lineaDeVariante(product, v.elegida, foto));
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label={product.name}
                className="relative w-full sm:max-w-md max-h-[90vh] bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col z-10">
                <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                </div>

                <div className="px-5 pt-3 sm:pt-5 pb-4 flex items-start gap-3.5 shrink-0">
                    {/* La foto sigue al color elegido. */}
                    <div className="w-24 h-24 rounded-2xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] shrink-0">
                        {foto && <img key={foto} src={resolveImageUrl(foto)} alt={product.name} onError={imgRetryOnError} className="w-full h-full object-cover modal-in" />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2 className="text-[16px] font-semibold tracking-tight text-content dark:text-white leading-snug">{product.name}</h2>
                        {v.elegida && <p className="text-[13px] text-content-subtle">{v.elegida.label}</p>}
                        <Money value={fmt(precio, baseCur)} className="block mt-1.5 text-[20px] font-bold tracking-tight text-content dark:text-white" />
                        {altCur && <Money value={fmt(precio, altCur)} className="block text-[12px] text-content-subtle" />}
                    </div>
                    <button onClick={onClose} aria-label="Cerrar"
                        className="w-9 h-9 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-5">
                    {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
                    {!data && !error && (
                        <div className="py-8 flex justify-center">
                            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                    {data && <VariantOptions v={v} />}
                </div>

                {data && (
                    <div className="shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/60 dark:border-white/[0.06]">
                        <button onClick={agregar} disabled={!v.elegida?.available}
                            className="w-full h-12 rounded-xl bg-brand-500 text-white text-[15px] font-semibold disabled:bg-surface-3 disabled:text-content-subtle dark:disabled:bg-white/[0.06] disabled:cursor-not-allowed active:scale-[0.99] transition">
                            {v.elegida
                                ? (v.elegida.available ? `Agregar al pedido · ${fmt(v.elegida.price, baseCur)}` : "Agotada")
                                : `Elige ${v.falta ? v.falta.name.toLowerCase() : "una opción"}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
