import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { calcPurchaseItem } from "../../helpers";
import { Spinner } from "../ui/Spinner";
import { splitQty } from "../ui/StockQty";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const soloEnteros = (v) => String(v).replace(/[^\d]/g, "").slice(0, 5);
const decimal = (raw) => {
    let v = String(raw).replace(/[^\d.,]/g, "").replace(",", ".");
    const i = v.indexOf(".");
    return i === -1 ? v : v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
};

// Curva de tallas: la mercancía de un modelo entra de una vez ("Negro: 2 S, 4 M, 4 L"), con
// un solo costo y un solo margen. Al agregar, cada talla con cantidad se vuelve una línea
// normal de la orden —por unidad—, así recibir, editar y el kardex siguen como siempre.
//
// Dos atributos se cargan como matriz (filas = el primero); uno o tres y más, como lista.
export default function VariantCurve({ model, warehouseId, invoiceRate = 1, invoiceSym = "Ref.", existingItems = [], onCancel, onAddMany }) {
    const [data, setData] = useState(null);
    const [qty, setQty] = useState({});          // id de variante -> cantidad (texto)
    const [cost, setCost] = useState("");        // costo por unidad, en la moneda de la factura
    const [margin, setMargin] = useState("30");
    const [error, setError] = useState(null);

    useEffect(() => {
        let vivo = true;
        api.products.variants(model.id, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!vivo) return;
                setData(r.data);
                const conCosto = r.data.variants.find(v => v.cost_price > 0);
                if (conCosto) setCost((conCosto.cost_price * invoiceRate).toFixed(2));
                if (r.data.model.profit_margin != null) setMargin(String(r.data.model.profit_margin));
            })
            .catch(e => { if (vivo) setError(e.message); });
        return () => { vivo = false; };
    }, [model.id, warehouseId]); // eslint-disable-line

    const enOrden = useMemo(() => new Set(existingItems.map(i => i.product?.id ?? i.product_id)), [existingItems]);
    const variantes = data?.variants || [];
    const attrs = data?.attributes || [];
    const unidad = data?.model?.unit || model.unit;
    const vendible = data?.model?.sellable !== false;

    const costBase = (parseFloat(cost) || 0) / (invoiceRate || 1);
    const totalUnidades = variantes.reduce((a, v) => a + (parseInt(qty[v.id], 10) || 0), 0);
    const totalLinea = totalUnidades * (parseFloat(cost) || 0);
    const muestra = calcPurchaseItem({ package_size: 1, package_qty: 1, package_price: costBase, profit_margin: vendible ? margin : "" });

    const buscar = (valores) => variantes.find(v => Object.entries(valores).every(([a, id]) => v.value_ids[a] === id));
    const cant = (v) => (v && !enOrden.has(v.id) ? parseInt(qty[v.id], 10) || 0 : 0);

    // Foto del color, como en el selector de la caja: la de cualquiera de sus variantes.
    const attrFotoId = (attrs.find(a => /colou?r/i.test(a.name)) || attrs[0])?.id;
    const hayFotos = variantes.some(v => v.image_url);
    const fotoDe = (attrId, valueId) => attrId !== attrFotoId ? null
        : variantes.find(v => v.value_ids[attrId] === valueId && v.image_url)?.image_url || null;
    const miniatura = (url, alt) => !hayFotos ? null : url ? (
        <img src={resolveImageUrl(url)} alt="" onError={imgRetryOnError} loading="lazy"
            className="w-8 h-8 rounded-md object-cover shrink-0 border border-border/60 dark:border-white/10" />
    ) : (
        <span aria-hidden="true" className="w-8 h-8 rounded-md shrink-0 bg-surface-3 dark:bg-white/[0.06] text-content-subtle text-[12px] font-semibold flex items-center justify-center">
            {String(alt || "?").charAt(0).toUpperCase()}
        </span>
    );
    // Solo el atributo de la foto (el color) lleva miniatura o inicial: en la talla salía
    // "S" dos veces, la inicial y el rótulo.
    const fotoAttr = (attrId, valueId, alt) => attrId === attrFotoId ? miniatura(fotoDe(attrId, valueId), alt) : null;

    const campo = (v) => {
        if (!v) return <div className="h-12 rounded-lg bg-surface-2/60 dark:bg-white/[0.02] flex items-center justify-center text-[12px] text-content-subtle/60">—</div>;
        const ya = enOrden.has(v.id);
        const [n] = splitQty(v.qty, unidad);
        return (
            <div className="flex flex-col items-center gap-0.5">
                <input value={ya ? "" : (qty[v.id] ?? "")} disabled={ya}
                    onChange={e => setQty(prev => ({ ...prev, [v.id]: soloEnteros(e.target.value) }))}
                    inputMode="numeric" autoComplete="off" placeholder={ya ? "" : "0"}
                    aria-label={`Cantidad de ${v.label}`}
                    className="w-full min-w-[44px] h-10 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-center text-[14px] font-semibold tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-surface-2 dark:disabled:bg-white/[0.02] disabled:text-content-subtle" />
                <span className="text-[10px] text-content-subtle tabular-nums leading-none h-[10px]">{ya ? "En la orden" : parseFloat(v.qty) > 0 ? `Hay ${n}` : "\u00A0"}</span>
            </div>
        );
    };

    const agregar = () => {
        if (!(costBase > 0)) return setError("Indica el costo por unidad");
        const lineas = variantes.filter(v => !enOrden.has(v.id) && (parseInt(qty[v.id], 10) || 0) > 0);
        if (!lineas.length) return setError("Escribe cuántas entran de al menos una talla");
        const base = Date.now();
        onAddMany(lineas.map((v, i) => {
            const form = {
                package_unit: "UNIDAD", package_size: "1", package_qty: String(parseInt(qty[v.id], 10)),
                package_price: String(costBase), profit_margin: vendible ? margin : "",
                lot_number: "", expiration_date: "",
            };
            const product = { id: v.id, name: v.name, unit: unidad, stock: v.qty, cost_price: v.cost_price || 0, price: v.price, sellable: vendible, parent_id: model.id };
            const calc = calcPurchaseItem({ ...form, product });
            const item = { ...form, product, ...calc, key: base + i };
            if (!vendible) { item.profit_margin = ""; item.sale_price = null; item.keepsPrice = true; }
            item.update_price = !(item.keepsPrice);
            return item;
        }));
    };

    let grilla;
    if (error && !data) {
        grilla = <p className="px-5 py-10 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>;
    } else if (!data) {
        grilla = <div className="py-12 flex justify-center text-content-subtle"><Spinner className="h-5 w-5" /></div>;
    } else if (!variantes.length) {
        grilla = <p className="px-5 py-10 text-center text-[13px] text-content-subtle">Este producto todavía no tiene variantes. Créalas en su ficha del catálogo.</p>;
    } else if (attrs.length === 2) {
        const [fa, ca] = attrs;
        grilla = (
            <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-left text-[11px] font-normal text-content-subtle pr-1 max-w-[80px]">{fa.name}</th>
                            {ca.values.map(c => <th key={c.id} className="text-[12px] font-semibold text-content dark:text-white">{c.value}</th>)}
                            <th className="w-12 text-right text-[11px] font-normal text-content-subtle pl-1">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fa.values.map(f => {
                            const totFila = ca.values.reduce((a, c) => a + cant(buscar({ [fa.id]: f.id, [ca.id]: c.id })), 0);
                            return (
                            <tr key={f.id}>
                                <th className="text-left text-[13px] font-semibold text-content dark:text-white pr-1 align-top pt-1">
                                    <span className="flex items-center gap-2">{fotoAttr(fa.id, f.id, f.value)}<span className="min-w-0">{f.value}</span></span>
                                </th>
                                {ca.values.map(c => <td key={c.id} className="align-top">{campo(buscar({ [fa.id]: f.id, [ca.id]: c.id }))}</td>)}
                                <td className="align-top pt-2.5 pl-1 text-right text-[13px] tabular-nums">
                                    {totFila > 0 ? <span className="font-semibold text-content dark:text-white">{totFila}</span> : <span className="text-content-subtle/50">—</span>}
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                    {/* Totales por columna: la curva de un vistazo ("L: 12"). Solo con algo cargado. */}
                    {totalUnidades > 0 && (
                        <tfoot>
                            <tr>
                                <th className="text-left text-[11px] font-normal text-content-subtle pr-1 pt-2 border-t border-border/60 dark:border-white/[0.06]">Total</th>
                                {ca.values.map(c => {
                                    const t = fa.values.reduce((a, f) => a + cant(buscar({ [fa.id]: f.id, [ca.id]: c.id })), 0);
                                    return <td key={c.id} className="pt-2 text-center text-[13px] tabular-nums border-t border-border/60 dark:border-white/[0.06]">{t > 0 ? <span className="font-semibold text-content dark:text-white">{t}</span> : <span className="text-content-subtle/50">—</span>}</td>;
                                })}
                                <td className="pt-2 pl-1 text-right text-[14px] font-bold text-content dark:text-white tabular-nums border-t border-border/60 dark:border-white/[0.06]">{totalUnidades}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        );
    } else {
        grilla = (
            <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                {variantes.map(v => (
                    <div key={v.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex items-center gap-2.5 min-w-0">{miniatura(v.image_url, v.label)}<span className="text-[13px] font-medium text-content dark:text-white truncate">{v.label}</span></span>
                        <div className="w-24 shrink-0">{campo(v)}</div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="mx-5 rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-3.5 py-3">
                    <div className="text-[14px] font-semibold text-content dark:text-white truncate">{model.name}</div>
                    <div className="text-[12px] text-content-subtle">Escribe cuántas entran de cada una. Las vacías no se agregan.</div>
                </div>

                <div className="px-5 pt-4 pb-5 space-y-5">
                    <section>{grilla}</section>

                    {data && variantes.length > 0 && (
                        <section>
                            <p className="text-[13px] font-semibold text-content dark:text-white mb-2.5">Costo y precio, para todas</p>
                            <div className={vendible ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] text-content-subtle">Costo por unidad</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{invoiceSym}</span>
                                        <input value={cost} onChange={e => { setCost(decimal(e.target.value)); setError(null); }}
                                            inputMode="decimal" autoComplete="off" placeholder="0.00"
                                            className="input h-10 pl-11 text-right text-[14px] font-semibold tabular-nums" />
                                    </div>
                                    {invoiceRate > 1 && costBase > 0 && <p className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(costBase)}</p>}
                                </div>
                                {vendible && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] text-content-subtle">Margen de ganancia</label>
                                        <div className="relative">
                                            <input value={margin} onChange={e => setMargin(decimal(e.target.value))}
                                                inputMode="decimal" autoComplete="off" placeholder="Sin cambio"
                                                className="input h-10 pr-8 text-right text-[14px] font-semibold tabular-nums" />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                        </div>
                                        {muestra.keepsPrice && <p className="text-[12px] text-content-subtle leading-snug">Vacío: el precio de venta queda como está.</p>}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {totalUnidades > 0 && costBase > 0 && (
                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {[
                                ["Entran al stock", `${totalUnidades} ${totalUnidades === 1 ? "unidad" : "unidades"}`],
                                ...(vendible ? [["Precio de venta", muestra.keepsPrice ? "Sin cambio" : `Ref. ${fmt2(muestra.sale_price)} cada una`]] : []),
                            ].map(([k, v]) => (
                                <div key={k} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                                    <span className="text-content-subtle">{k}</span>
                                    <span className="font-medium text-content dark:text-white tabular-nums text-right">{v}</span>
                                </div>
                            ))}
                            <div className="px-4 py-3 flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-white/[0.02] rounded-b-xl">
                                <span className="text-[13px] font-semibold text-content dark:text-white">Total</span>
                                <span className="text-[16px] font-bold text-content dark:text-white tabular-nums">{invoiceSym} {fmt2(totalLinea)}</span>
                            </div>
                        </div>
                    )}
                    {error && data && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
                </div>
            </div>

            <div className="shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border/60 dark:border-white/[0.06] flex items-center gap-2">
                {totalUnidades === 0 && (
                    <span className="mr-auto text-[13px] text-content-subtle">Escribe cuántas entran de cada una</span>
                )}
                <button onClick={onCancel} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                {totalUnidades > 0 && (
                    <button onClick={agregar}
                        className="flex-1 btn-accent h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                        Agregar {totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"}{costBase > 0 ? ` · ${invoiceSym} ${fmt2(totalLinea)}` : ""}
                    </button>
                )}
            </div>
        </>
    );
}
