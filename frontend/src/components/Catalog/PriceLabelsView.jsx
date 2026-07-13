import { useState, useEffect, useMemo } from "react";
import { useApp } from "../../context/AppContext";

// Tamaños de rollo/etiqueta más comunes (ancho × alto en mm)
const ROLL_PRESETS = [
    { w: 40, h: 30 },
    { w: 50, h: 30 },
    { w: 58, h: 40 },
    { w: 70, h: 38 },
    { w: 80, h: 40 },
];

const mm = (v) => `${v}mm`;

export default function PriceLabelsView({ products, onClose }) {
    const { currencies, baseCurrency } = useApp();
    const [selCurrency, setSelCurrency] = useState(baseCurrency || (currencies.length > 0 ? currencies[0] : { symbol: 'Ref.', exchange_rate: 1 }));

    // Modo de impresión: 'roll' (térmica de rollo) | 'sheet' (hoja carta 3×7)
    const [mode, setMode] = useState('roll');
    // Tamaño de etiqueta del rollo (mm)
    const [roll, setRoll] = useState({ w: 70, h: 38 });

    useEffect(() => {
        if (baseCurrency) setSelCurrency(baseCurrency);
    }, [baseCurrency]);

    const getConvertedPrice = (basePrice) => {
        if (!selCurrency || !baseCurrency) return { int: "0", dec: "00" };
        const price = parseFloat(basePrice || 0);
        const converted = (price / baseCurrency.exchange_rate) * selCurrency.exchange_rate;
        const val = converted.toFixed(2);
        const [int, dec] = val.split(".");
        return { int, dec };
    };

    // ── Modo HOJA (carta): 21 etiquetas por hoja, tamaño fijo 70×38 ──────────
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
    const sheetPages = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < products.length; i += 21) chunks.push(products.slice(i, i + 21));
        return chunks;
    }, [products]);

    // ── Modo ROLLO: auto-escalado proporcional al tamaño de la etiqueta ──────
    const pad = Math.max(1.5, roll.h * 0.08); // margen interno en mm
    // Tamaño (mm) del entero del precio, limitado por ancho (según nº de dígitos) y por alto
    const rollPriceSize = (intPart) => {
        const availW = roll.w - pad * 2;
        const digits = Math.max(1, intPart.length);
        const byWidth = availW / (digits * 0.62 + 1.1); // +1.1 reserva símbolo/decimales
        const byHeight = roll.h * 0.5;
        return Math.max(3, Math.min(byWidth, byHeight));
    };
    const rollNameSize = () => Math.max(2, Math.min(roll.h * 0.14, roll.w * 0.085));

    const setRollSize = (patch) => setRoll(p => ({ ...p, ...patch }));

    return (
        <div className="fixed inset-0 z-[2000] bg-white text-black overflow-auto print:static print:inset-auto print:bg-white print:overflow-visible">
            {/* ── Controles (ocultos al imprimir) ── */}
            <div className="print:hidden p-4 bg-surface-2 dark:bg-surface-dark-2 border-b flex flex-wrap items-center gap-4 sticky top-0 z-50">
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-brand-500">Vista de Impresión</span>
                    <span className="text-[10px] text-content-subtle font-bold">{products.length} producto(s)</span>
                </div>

                {/* Modo */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                    <button onClick={() => setMode('roll')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${mode === 'roll' ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle'}`}>
                        Rollo térmico
                    </button>
                    <button onClick={() => setMode('sheet')}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${mode === 'sheet' ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle'}`}>
                        Hoja carta (3×7)
                    </button>
                </div>

                {/* Tamaño de rollo (solo en modo rollo) */}
                {mode === 'roll' && (
                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                        <span className="text-[10px] font-black uppercase text-content-subtle ml-2">Etiqueta:</span>
                        {ROLL_PRESETS.map(r => {
                            const active = roll.w === r.w && roll.h === r.h;
                            return (
                                <button key={`${r.w}x${r.h}`} onClick={() => setRoll({ w: r.w, h: r.h })}
                                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${active ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle'}`}>
                                    {r.w}×{r.h}
                                </button>
                            );
                        })}
                        <div className="flex items-center gap-1 ml-1">
                            <input type="number" min="15" max="82" value={roll.w}
                                onChange={e => setRollSize({ w: Math.min(82, Math.max(15, parseInt(e.target.value) || 0)) })}
                                className="w-14 h-7 bg-white/10 rounded-md px-2 text-[11px] font-bold text-center outline-none" />
                            <span className="text-[10px] font-black text-content-subtle">×</span>
                            <input type="number" min="10" max="300" value={roll.h}
                                onChange={e => setRollSize({ h: Math.min(300, Math.max(10, parseInt(e.target.value) || 0)) })}
                                className="w-14 h-7 bg-white/10 rounded-md px-2 text-[11px] font-bold text-center outline-none" />
                            <span className="text-[10px] font-black text-content-subtle">mm</span>
                        </div>
                    </div>
                )}

                {/* Moneda */}
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                    <span className="text-[10px] font-black uppercase text-content-subtle ml-2">Moneda:</span>
                    {currencies.filter(c => c.active).map(c => (
                        <button key={c.id} onClick={() => setSelCurrency(c)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${selCurrency?.id === c.id ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle'}`}>
                            {c.symbol} {c.code}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 ml-auto">
                    <button onClick={() => window.print()} className="px-6 py-2 bg-brand-500 text-black text-[11px] font-black uppercase rounded-lg shadow-lg shadow-brand-500/20 active:scale-95 transition-all">
                        Enviar a Impresora
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-surface-3 dark:bg-white/10 text-[11px] font-black uppercase rounded-lg">
                        Cerrar
                    </button>
                </div>
            </div>

            {/* ── Contenido imprimible ── */}
            {mode === 'sheet' ? (
                // ═══════════ MODO HOJA CARTA (3×7) ═══════════
                <div className="flex flex-col items-center gap-8 py-8 print:p-0 print:gap-0 bg-gray-100 dark:bg-black/20 min-h-screen print:bg-white page-container">
                    {sheetPages.map((pageProducts, pageIdx) => (
                        <div key={pageIdx} className="grid grid-cols-3 grid-rows-7 gap-0 bg-white shadow-2xl print:shadow-none w-[215.9mm] h-[279.4mm] p-[4mm] box-border page-break">
                            {pageProducts.map((p, idx) => {
                                const { int, dec } = getConvertedPrice(p.price);
                                const styles = getPriceStyles(int);
                                return (
                                    <div key={`${p.id}-${idx}`} className="w-[70mm] h-[38mm] border border-gray-100 relative overflow-hidden flex flex-col p-3 box-border justify-between">
                                        <div className={`font-black text-black uppercase break-words tracking-tight line-clamp-2 ${getNameStyles(p.name)}`}>{p.name}</div>
                                        <div className={`flex items-start justify-center text-center ${styles.mt}`}>
                                            <span className={`font-black mr-1 py-1 ${styles.symSize}`}>{selCurrency?.symbol}</span>
                                            <span className={`font-black tracking-tighter leading-[0.7] py-1 ${styles.intSize}`}>{int}</span>
                                            <div className="flex flex-col ml-1">
                                                <span className={`font-black leading-none border-b-[3px] border-black pb-0.5 ${styles.decSize}`}>{dec}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            ) : (
                // ═══════════ MODO ROLLO TÉRMICO (una etiqueta por página) ═══════════
                <div className="flex flex-col items-center gap-3 py-8 print:p-0 print:gap-0 bg-gray-100 dark:bg-black/20 min-h-screen print:bg-white page-container">
                    {products.map((p, idx) => {
                        const { int, dec } = getConvertedPrice(p.price);
                        const ps = rollPriceSize(int);
                        const ns = rollNameSize();
                        return (
                            <div key={`${p.id}-${idx}`}
                                className="label-roll bg-white shadow-lg print:shadow-none overflow-hidden flex flex-col justify-between box-border"
                                style={{ width: mm(roll.w), height: mm(roll.h), padding: mm(pad) }}>
                                <div className="font-black text-black uppercase leading-[1.1] line-clamp-2 tracking-tight"
                                    style={{ fontSize: mm(ns) }}>
                                    {p.name}
                                </div>
                                <div className="flex items-end justify-center text-center w-full">
                                    <span className="font-black" style={{ fontSize: mm(ps * 0.42) }}>{selCurrency?.symbol}</span>
                                    <span className="font-black tracking-tighter leading-[0.8]" style={{ fontSize: mm(ps) }}>{int}</span>
                                    <span className="font-black leading-none" style={{ fontSize: mm(ps * 0.45) }}>,{dec}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        margin: 0;
                        size: ${mode === 'roll' ? `${roll.w}mm ${roll.h}mm` : 'letter'};
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100%;
                        visibility: hidden !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    #print-section, #print-section * { visibility: visible !important; }
                    #print-section {
                        position: absolute !important;
                        left: 0 !important; top: 0 !important;
                        margin: 0 !important; padding: 0 !important;
                        background: white !important;
                    }
                    .print\\:hidden { display: none !important; }

                    .page-container {
                        display: block !important;
                        margin: 0 !important; padding: 0 !important;
                        min-height: 0 !important;
                        background: white !important;
                    }

                    /* Hoja carta */
                    .page-break {
                        display: grid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        page-break-inside: avoid !important;
                        width: 215.9mm !important;
                        height: 279.4mm !important;
                        margin: 0 !important;
                        padding: 5mm !important;
                        box-sizing: border-box !important;
                        background: white !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                    }

                    /* Rollo térmico: una etiqueta por página */
                    .label-roll {
                        width: ${roll.w}mm !important;
                        height: ${roll.h}mm !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        page-break-inside: avoid !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        background: white !important;
                    }
                    .label-roll:last-child {
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                    }
                }
            ` }} />
        </div>
    );
}
