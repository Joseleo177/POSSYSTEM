import { useState, useEffect, useMemo } from "react";
import { resolveImageUrl } from "../../helpers";
import { useApp } from "../../context/AppContext";

export default function PriceLabelsView({ products, onClose }) {
    const { currencies, baseCurrency } = useApp();
    const [selCurrency, setSelCurrency] = useState(baseCurrency || (currencies.length > 0 ? currencies[0] : { symbol: '$', exchange_rate: 1 }));

    useEffect(() => {
        if (baseCurrency) setSelCurrency(baseCurrency);
    }, [baseCurrency]);
    
    useEffect(() => {
        // Al montar, disparamos el diálogo de impresión del navegador
        const t = setTimeout(() => {
            window.print();
        }, 800);
        return () => clearTimeout(t);
    }, []);

    // Fragmentar productos en grupos de 21 (3x7)
    const pages = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < products.length; i += 21) {
            chunks.push(products.slice(i, i + 21));
        }
        return chunks;
    }, [products]);

    const getConvertedPrice = (basePrice) => {
        if (!selCurrency || !baseCurrency) return { int: "0", dec: "00" };
        const price = parseFloat(basePrice || 0);
        const converted = (price / baseCurrency.exchange_rate) * selCurrency.exchange_rate;
        const val = converted.toFixed(2);
        const [int, dec] = val.split(".");
        return { int, dec };
    };

    // Funciones de escalado dinámico (Ajustadas para evitar desbordamiento en Bs.)
    const getPriceStyles = (intPart) => {
        const len = intPart.length;
        if (len <= 2) return { intSize: "text-[105px]", symSize: "text-2xl", decSize: "text-3xl", mt: "mt-4" };
        if (len === 3) return { intSize: "text-[85px]", symSize: "text-xl", decSize: "text-2xl", mt: "mt-4" };
        if (len === 4) return { intSize: "text-[65px]", symSize: "text-lg", decSize: "text-xl", mt: "mt-3" };
        if (len === 5) return { intSize: "text-[52px]", symSize: "text-base", decSize: "text-lg", mt: "mt-2" };
        if (len === 6) return { intSize: "text-[45px]", symSize: "text-xs", decSize: "text-base", mt: "mt-1" };
        return { intSize: "text-[38px]", symSize: "text-[10px]", decSize: "text-xs", mt: "mt-1" };
    };

    const getNameStyles = (name) => {
        const len = name.length;
        if (len <= 20) return "text-[21px] leading-[1.2]";
        if (len <= 40) return "text-[17px] leading-[1.2]";
        return "text-[14px] leading-[1.2]";
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-white text-black overflow-auto print:static print:inset-auto print:bg-white print:overflow-visible">
            {/* Controles de la vista (ocultos al imprimir) */}
            <div className="print:hidden p-4 bg-surface-2 dark:bg-surface-dark-2 border-b flex items-center justify-between sticky top-0 z-50">
                <div className="flex gap-6 items-center">
                    <div className="flex flex-col">
                        <span className="text-xs font-black uppercase text-brand-500 text-center sm:text-left">Vista de Impresión v3.0 (Smart Scan)</span>
                        <span className="text-[10px] text-content-subtle font-bold">Auto-ajuste de tamaño por longitud de precio</span>
                    </div>

                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                        <span className="text-[10px] font-black uppercase text-content-subtle ml-2">Moneda:</span>
                        {currencies.filter(c => c.active).map(c => (
                            <button
                                key={c.id}
                                onClick={() => setSelCurrency(c)}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${selCurrency?.id === c.id ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle'}`}
                            >
                                {c.symbol} {c.code}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="px-6 py-2 bg-brand-500 text-black text-[11px] font-black uppercase rounded-lg shadow-lg shadow-brand-500/20 active:scale-95 transition-all">
                        Enviar a Impresora
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-surface-3 dark:bg-white/10 text-[11px] font-black uppercase rounded-lg">
                        Cerrar
                    </button>
                </div>
            </div>

            {/* Pliegos de Etiquetas */}
            <div className="flex flex-col items-center gap-8 py-8 print:p-0 print:gap-0 bg-gray-100 dark:bg-black/20 min-h-screen print:bg-white page-container">
                {pages.map((pageProducts, pageIdx) => (
                    <div 
                        key={pageIdx}
                        className="grid grid-cols-3 grid-rows-7 gap-0 bg-white shadow-2xl print:shadow-none w-[215.9mm] h-[279.4mm] p-[4mm] box-border page-break"
                    >
                        {pageProducts.map((p, idx) => {
                            const { int, dec } = getConvertedPrice(p.price);
                            const styles = getPriceStyles(int);
                            return (
                                <div 
                                    key={`${p.id}-${idx}`}
                                    className="w-[70mm] h-[38mm] border border-gray-100 relative overflow-hidden flex flex-col p-3 box-border justify-between"
                                >
                                    {/* Product Name - Auto scaling */}
                                    <div className={`font-black text-black uppercase break-words tracking-tight line-clamp-2 ${getNameStyles(p.name)}`}>
                                        {p.name}
                                    </div>

                                    {/* Price Section - RADICAL AUTO SIZE */}
                                    <div className={`flex items-start justify-center text-center ${styles.mt}`}>
                                        <span className={`font-black mr-1 py-1 ${styles.symSize}`}>{selCurrency?.symbol}</span>
                                        <span className={`font-black tracking-tighter leading-[0.7] py-1 ${styles.intSize}`}>{int}</span>
                                        <div className="flex flex-col ml-1">
                                            <span className={`font-black leading-none border-b-[3px] border-black pb-0.5 ${styles.decSize}`}>{dec}</span>
                                        </div>
                                    </div>

                                    {/* Guías de corte sutiles */}
                                    <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-gray-100" />
                                    <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-gray-100" />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { 
                        margin: 0; 
                        size: letter; 
                    }
                    html, body { 
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        min-height: 100% !important;
                        visibility: hidden !important;
                        background: white !important;
                    }
                    
                    /* Solo el área de impresión y sus hijos son visibles */
                    #print-section, #print-section * {
                        visibility: visible !important;
                    }

                    #print-section {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 215.9mm !important;
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }

                    .print\\:hidden { display: none !important; }
                    
                    .page-container {
                        display: block !important;
                        width: 215.9mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .page-break { 
                        display: grid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        page-break-inside: avoid !important;
                        width: 215.9mm !important;
                        height: 279.4mm !important;
                        margin: 0 !important;
                        padding: 4mm !important;
                        box-sizing: border-box !important;
                        background: white !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                }
            ` }} />
        </div>
    );
}


