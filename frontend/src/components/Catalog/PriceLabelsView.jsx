import { useState, useEffect, useMemo, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import PriceLabel from "./PriceLabel";
import LabelDesignerPanel from "./LabelDesignerPanel";
import { normalizeLayout, DEFAULT_TEMPLATE, LABEL_ELEMENTS } from "./labelTemplate";

// Tamaños de rollo/etiqueta más comunes (ancho × alto en mm)
const ROLL_PRESETS = [
    { w: 40, h: 30 },
    { w: 50, h: 30 },
    { w: 58, h: 40 },
    { w: 70, h: 38 },
    { w: 80, h: 40 },
];

// La hoja carta lleva 21 etiquetas de 70×38 en rejilla de 3×7
const SHEET = { w: 70, h: 38, perPage: 21 };

export default function PriceLabelsView({ products, onClose }) {
    const { currencies, baseCurrency, settings, loadSettings, companyInfo, notify, can } = useApp();

    const [layout, setLayout] = useState(() => normalizeLayout(settings?.price_label_template));
    const [showPanel, setShowPanel] = useState(false);
    const [saving, setSaving] = useState(false);

    const [selCurrency, setSelCurrency] = useState(baseCurrency || currencies[0] || { symbol: "Ref.", exchange_rate: 1 });

    // La plantilla guardada puede llegar después que el componente si los ajustes aún se están
    // cargando; en cuanto llega se adopta, salvo que el usuario ya haya tocado algo.
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        if (!touched) setLayout(normalizeLayout(settings?.price_label_template));
    }, [settings?.price_label_template, touched]);

    useEffect(() => {
        if (baseCurrency) setSelCurrency(baseCurrency);
    }, [baseCurrency]);

    const activeCurrencies = useMemo(() => currencies.filter(c => c.active), [currencies]);
    const altCurrency = useMemo(
        () => activeCurrencies.find(c => String(c.id) === String(layout.altCurrencyId)) || null,
        [activeCurrencies, layout.altCurrencyId]
    );

    // Convierte desde la moneda base a la pedida y parte el número en entero y decimales
    const convert = useCallback((basePrice, currency) => {
        if (!currency || !baseCurrency) return { int: "0", dec: "00" };
        const price = parseFloat(basePrice || 0);
        const converted = (price / baseCurrency.exchange_rate) * currency.exchange_rate;
        const [int, dec] = converted.toFixed(2).split(".");
        return { int, dec };
    }, [baseCurrency]);

    // ── Edición de la plantilla ─────────────────────────────────────────────
    const patchLayout = (patch) => { setTouched(true); setLayout(p => ({ ...p, ...patch })); };

    const onElement = (id, patch) => {
        setTouched(true);
        setLayout(p => ({ ...p, template: { ...p.template, [id]: { ...p.template[id], ...patch } } }));
    };

    // Mover dentro de la zona: se intercambia el orden con el vecino activo, así el elemento
    // no salta por encima de uno apagado que el usuario no está viendo.
    const onMove = (id, dir) => {
        setTouched(true);
        setLayout(p => {
            const el = p.template[id];
            const siblings = LABEL_ELEMENTS
                .map(d => ({ id: d.id, ...p.template[d.id] }))
                .filter(e => e.on && e.zone === el.zone)
                .sort((a, b) => a.order - b.order);

            const idx = siblings.findIndex(e => e.id === id);
            const target = siblings[idx + dir];
            if (idx === -1 || !target) return p;

            return {
                ...p,
                template: {
                    ...p.template,
                    [id]: { ...el, order: target.order },
                    [target.id]: { ...p.template[target.id], order: el.order },
                },
            };
        });
    };

    const onReset = () => { setTouched(true); setLayout(p => ({ ...p, template: DEFAULT_TEMPLATE })); };

    const onSave = async () => {
        setSaving(true);
        try {
            await api.settings.update({ price_label_template: JSON.stringify(layout) });
            await loadSettings();
            setTouched(false);
            notify("Plantilla de etiqueta guardada", "ok");
        } catch (err) {
            notify(err.message || "No se pudo guardar la plantilla", "err");
        } finally {
            setSaving(false);
        }
    };

    const setRoll = (patch) => patchLayout({ roll: { ...layout.roll, ...patch } });

    const sheetPages = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < products.length; i += SHEET.perPage) chunks.push(products.slice(i, i + SHEET.perPage));
        return chunks;
    }, [products]);

    const dims = layout.mode === "sheet" ? SHEET : layout.roll;

    const labelFor = (p, idx) => (
        <PriceLabel
            key={`${p.id}-${idx}`}
            product={p}
            template={layout.template}
            width={dims.w}
            height={dims.h}
            border={layout.border}
            currency={selCurrency}
            altCurrency={altCurrency}
            convert={convert}
            companyInfo={companyInfo}
            categoryName={p.category_name}
        />
    );

    return (
        <div className="fixed inset-0 z-[2000] bg-white text-black flex flex-col print:static print:inset-auto print:bg-white print:block">
            {/* ── Controles (ocultos al imprimir) ── */}
            <div className="print:hidden p-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-border/40 dark:border-white/5 flex flex-wrap items-center gap-4 shrink-0">
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-brand-500">Vista de Impresión</span>
                    <span className="text-[10px] text-content-subtle font-bold">{products.length} producto(s)</span>
                </div>

                {/* Modo */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                    <button onClick={() => patchLayout({ mode: "roll" })}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${layout.mode === "roll" ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle"}`}>
                        Rollo térmico
                    </button>
                    <button onClick={() => patchLayout({ mode: "sheet" })}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${layout.mode === "sheet" ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle"}`}>
                        Hoja carta (3×7)
                    </button>
                </div>

                {/* Tamaño de rollo (solo en modo rollo) */}
                {layout.mode === "roll" && (
                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                        <span className="text-[10px] font-black uppercase text-content-subtle ml-2">Etiqueta:</span>
                        {ROLL_PRESETS.map(r => {
                            const active = layout.roll.w === r.w && layout.roll.h === r.h;
                            return (
                                <button key={`${r.w}x${r.h}`} onClick={() => setRoll({ w: r.w, h: r.h })}
                                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${active ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle"}`}>
                                    {r.w}×{r.h}
                                </button>
                            );
                        })}
                        <div className="flex items-center gap-1 ml-1">
                            <input type="number" min="15" max="82" value={layout.roll.w}
                                onChange={e => setRoll({ w: Math.min(82, Math.max(15, parseInt(e.target.value) || 0)) })}
                                className="w-14 h-7 bg-white/10 rounded-md px-2 text-[11px] font-bold text-center outline-none" />
                            <span className="text-[10px] font-black text-content-subtle">×</span>
                            <input type="number" min="10" max="300" value={layout.roll.h}
                                onChange={e => setRoll({ h: Math.min(300, Math.max(10, parseInt(e.target.value) || 0)) })}
                                className="w-14 h-7 bg-white/10 rounded-md px-2 text-[11px] font-bold text-center outline-none" />
                            <span className="text-[10px] font-black text-content-subtle">mm</span>
                        </div>
                    </div>
                )}

                {/* Moneda */}
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                    <span className="text-[10px] font-black uppercase text-content-subtle ml-2">Moneda:</span>
                    {activeCurrencies.map(c => (
                        <button key={c.id} onClick={() => setSelCurrency(c)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${selCurrency?.id === c.id ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle"}`}>
                            {c.symbol} {c.code}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 ml-auto">
                    <button onClick={() => setShowPanel(v => !v)}
                        className={`px-4 py-2 text-[11px] font-black uppercase rounded-lg border transition-all flex items-center gap-2 ${showPanel
                            ? "bg-brand-500 text-black border-brand-500"
                            : "bg-surface-3 dark:bg-white/10 border-border/40 dark:border-white/10"}`}>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                            <path d="M3 5h14M3 10h9M3 15h5" />
                        </svg>
                        Diseño
                    </button>
                    <button onClick={() => window.print()} className="px-6 py-2 bg-brand-500 text-black text-[11px] font-black uppercase rounded-lg shadow-lg shadow-brand-500/20 active:scale-95 transition-all">
                        Enviar a Impresora
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-surface-3 dark:bg-white/10 text-[11px] font-black uppercase rounded-lg">
                        Cerrar
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0 print:block">
                {/* ── Contenido imprimible ── */}
                <div className={`flex-1 overflow-auto print:overflow-visible ${layout.mode === "roll" ? "mode-roll" : "mode-sheet"}`}>
                    {layout.mode === "sheet" ? (
                        <div className="flex flex-col items-center gap-8 py-8 print:p-0 print:gap-0 bg-gray-100 dark:bg-black/20 min-h-full print:bg-white page-container">
                            {sheetPages.map((pageProducts, pageIdx) => (
                                <div key={pageIdx} className="grid grid-cols-3 grid-rows-7 gap-0 bg-white shadow-2xl print:shadow-none w-[215.9mm] h-[279.4mm] p-[4mm] box-border page-break">
                                    {pageProducts.map(labelFor)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-8 print:p-0 print:gap-0 bg-gray-100 dark:bg-black/20 min-h-full print:bg-white page-container">
                            {products.map((p, idx) => (
                                <div key={`${p.id}-${idx}`} className="shadow-lg print:shadow-none">
                                    {labelFor(p, idx)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {showPanel && (
                    <LabelDesignerPanel
                        template={layout.template}
                        onElement={onElement}
                        onMove={onMove}
                        onReset={onReset}
                        border={layout.border}
                        onBorder={v => patchLayout({ border: v })}
                        altCurrencyId={layout.altCurrencyId}
                        onAltCurrency={v => patchLayout({ altCurrencyId: v })}
                        currencies={activeCurrencies}
                        canSave={can("config.edit")}
                        saving={saving}
                        onSave={onSave}
                        onClose={() => setShowPanel(false)}
                    />
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        margin: 0;
                        size: ${layout.mode === "roll" ? `${layout.roll.w}mm ${layout.roll.h}mm` : "letter"};
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
                    .mode-roll .label-unit {
                        margin: 0 !important;
                        box-shadow: none !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        page-break-inside: avoid !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        background: white !important;
                    }
                    .mode-roll .page-container > div:last-child .label-unit {
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                    }
                    .mode-roll .page-container > div { box-shadow: none !important; }

                    .label-unit { break-inside: avoid !important; }
                }
            ` }} />
        </div>
    );
}
