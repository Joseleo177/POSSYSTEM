import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { splitQty } from "../ui/StockQty";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import Money from "../ui/Money";

// Selector de variante en la caja: tocar "Franela Básica" abre esta grilla, y tocar una celda
// abre el modal de cantidad con esa variante, como cualquier producto.
//
//  - Dos atributos: matriz (filas = el primero, columnas = el segundo), con la existencia de
//    esta sucursal en cada celda. Es la forma en que la gente piensa la ropa: "la negra en L".
//  - Uno: una fila de botones (S, M, L…).
//  - Tres o más: lista, porque una matriz de tres ejes no se lee.
//
// Las celdas agotadas o sin variante quedan apagadas: venderlas daría el aviso de existencias
// después de elegirlas, que es justo lo que la grilla está para evitar.
export default function VariantPickerModal({ model, warehouseId, onClose, onPick, notify, fmt, convertToDisplay, currSym }) {
    const [data, setData] = useState(null);
    const [rows, setRows] = useState({});   // id de variante -> fila lista para el carrito

    useEffect(() => {
        if (!model) return;
        let vivo = true;
        setData(null);
        setRows({});
        (async () => {
            try {
                const r = await api.products.variants(model.id, { warehouse_id: warehouseId });
                if (!vivo) return;
                setData(r.data);
                // La fila del carrito sale de la misma consulta que la grilla de la caja: precio
                // de la sucursal, paso de venta, costo. Así la variante entra igual que un
                // producto suelto.
                const ids = r.data.variants.filter(v => v.in_warehouse).map(v => v.id);
                if (ids.length) {
                    const p = await api.warehouses.getProducts(warehouseId, { ids: ids.join(","), sellable_only: true, limit: ids.length });
                    if (vivo) setRows(Object.fromEntries((p.data || []).map(x => [x.id, x])));
                }
            } catch (e) {
                notify?.(e.message, "err");
                onClose();
            }
        })();
        return () => { vivo = false; };
    }, [model?.id, warehouseId]); // eslint-disable-line

    if (!model) return null;

    const variantes = data?.variants || [];
    const attrs = data?.attributes || [];
    const fila = (v) => rows[v.id];
    const disponible = (v) => !!fila(v) && parseFloat(fila(v).stock) > 0;
    const precio = (v) => parseFloat(fila(v)?.price ?? v.price);
    const precioModelo = parseFloat(model.price);

    const elegir = (v) => {
        if (!disponible(v)) return;
        onPick(fila(v));
    };

    // Foto de un color: la de cualquiera de sus variantes (se suben juntas desde la ficha).
    // Solo en el atributo de la foto (el color, o el primero si no hay uno que se llame así):
    // la talla S no tiene foto propia aunque Negro/S sí.
    const attrFotoId = (attrs.find(a => /colou?r/i.test(a.name)) || attrs[0])?.id;
    const fotoDe = (attrId, valueId) => attrId !== attrFotoId ? null
        : variantes.find(v => v.value_ids[attrId] === valueId && v.image_url)?.image_url || null;
    const hayFotos = variantes.some(v => v.image_url);
    const miniatura = (url, alt) => url ? (
        <img src={resolveImageUrl(url)} alt={alt} onError={imgRetryOnError} loading="lazy"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-md object-cover shrink-0 border border-border/60 dark:border-white/10" />
    ) : hayFotos ? (
        <span aria-hidden="true" className="w-8 h-8 sm:w-9 sm:h-9 rounded-md shrink-0 bg-surface-3 dark:bg-white/[0.06] text-content-subtle text-[12px] font-semibold flex items-center justify-center">
            {String(alt || "?").charAt(0).toUpperCase()}
        </span>
    ) : null;
    // Solo el atributo de la foto (el color) lleva miniatura o inicial: en la talla salía
    // "S" dos veces, la inicial y el rótulo.
    const fotoAttr = (attrId, valueId, alt) => attrId === attrFotoId ? miniatura(fotoDe(attrId, valueId), alt) : null;

    const buscar = (valores) => variantes.find(v => Object.entries(valores).every(([a, id]) => v.value_ids[a] === id));

    const celda = (v, etiqueta, key) => {
        if (!v) {
            return <div key={key} className="h-14 rounded-lg flex items-center justify-center text-[12px] text-content-subtle/50" title="No existe esta combinación">—</div>;
        }
        const ok = disponible(v);
        const qty = fila(v)?.stock ?? 0;
        const [n] = splitQty(qty, model.unit);
        const distinto = Math.abs(precio(v) - precioModelo) > 1e-9;
        return (
            <button key={key} type="button" onClick={() => elegir(v)} disabled={!ok}
                aria-label={`${v.label}: ${ok ? `${n} disponibles` : "agotado"}`}
                className={`h-14 w-full rounded-lg border px-1.5 flex flex-col items-center justify-center transition-colors ${ok
                    ? "border-border dark:border-white/15 bg-white dark:bg-white/[0.05] shadow-sm hover:border-brand-500 hover:bg-brand-500/[0.04] active:scale-[0.97]"
                    : "border-dashed border-border/70 dark:border-white/10 cursor-not-allowed"}`}>
                {etiqueta && <span className={`text-[13px] font-semibold leading-tight ${ok ? "text-content dark:text-white" : "text-content-subtle"}`}>{etiqueta}</span>}
                {/* Agotado va en gris, no en rojo: en una curva de tallas es lo común, y ocho
                    "Agotado" rojos tapaban las dos celdas que sí se pueden vender. */}
                <span className={`tabular-nums leading-tight ${ok ? (etiqueta ? "text-[11px] text-content-subtle" : "text-[16px] font-semibold text-content dark:text-white") : "text-[12px] text-content-subtle/70"}`}>
                    {ok ? n : <><span className="sm:hidden">0</span><span className="hidden sm:inline">Agotado</span></>}
                </span>
                {ok && !etiqueta && <span className="text-[10px] text-content-subtle leading-tight">disp.</span>}
                {ok && distinto && (
                    <span className="text-[10px] text-content-subtle tabular-nums leading-tight whitespace-nowrap">
                        <span className="hidden sm:inline">{fmt(convertToDisplay(precio(v)), currSym)}</span>
                        <span className="sm:hidden">{fmt(convertToDisplay(precio(v)), "").trim()}</span>
                    </span>
                )}
            </button>
        );
    };

    let cuerpo;
    if (!data) {
        cuerpo = <div className="py-12 flex justify-center text-content-subtle"><Spinner className="h-5 w-5" /></div>;
    } else if (!variantes.length) {
        cuerpo = <p className="py-10 text-center text-[13px] text-content-subtle">Este producto todavía no tiene variantes.</p>;
    } else if (attrs.length === 2) {
        const [filasAttr, colsAttr] = attrs;
        cuerpo = (
            <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full border-separate border-spacing-1 sm:border-spacing-1.5">
                    <thead>
                        <tr>
                            <th className="text-left text-[11px] sm:text-[12px] font-normal text-content-subtle pr-1 sm:pr-2 max-w-[80px] break-words">{filasAttr.name}</th>
                            {colsAttr.values.map(c => (
                                <th key={c.id} className="text-[12px] font-semibold text-content dark:text-white min-w-[44px] sm:min-w-[56px]">
                                    <span className="inline-flex flex-col items-center gap-1">{fotoAttr(colsAttr.id, c.id, c.value)}{c.value}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filasAttr.values.map(f => {
                            const hayAlgo = colsAttr.values.some(c => { const v = buscar({ [filasAttr.id]: f.id, [colsAttr.id]: c.id }); return v && disponible(v); });
                            return (
                            <tr key={f.id}>
                                <th className={`text-left text-[13px] font-semibold pr-1 sm:pr-2 ${hayAlgo ? "text-content dark:text-white" : "text-content-subtle"}`}>
                                    <span className="flex items-center gap-2">{fotoAttr(filasAttr.id, f.id, f.value)}<span className="min-w-0">{f.value}</span></span>
                                </th>
                                {colsAttr.values.map(c => (
                                    <td key={c.id}>{celda(buscar({ [filasAttr.id]: f.id, [colsAttr.id]: c.id }))}</td>
                                ))}
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    } else if (attrs.length === 1) {
        const [a] = attrs;
        cuerpo = (
            <div>
                <p className="text-[12px] text-content-subtle mb-2">{a.name}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
                    {a.values.map(val => celda(buscar({ [a.id]: val.id }), val.value, val.id))}
                </div>
            </div>
        );
    } else {
        cuerpo = (
            <div className="divide-y divide-border/60 dark:divide-white/[0.06] -mx-1">
                {variantes.map(v => {
                    const ok = disponible(v);
                    const [n, u] = splitQty(fila(v)?.stock ?? 0, model.unit);
                    return (
                        <button key={v.id} type="button" onClick={() => elegir(v)} disabled={!ok}
                            className={`w-full flex items-center justify-between gap-3 px-1 py-3 text-left ${ok ? "hover:bg-surface-2/60 dark:hover:bg-white/[0.03]" : "opacity-50 cursor-not-allowed"}`}>
                            <span className="flex items-center gap-2.5 min-w-0">
                                {miniatura(v.image_url, v.label)}
                                <span className="text-[13px] font-medium text-content dark:text-white truncate">{v.label}</span>
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="block text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmt(convertToDisplay(precio(v)), currSym)}</span>
                                <span className={`block text-[11px] tabular-nums ${ok ? "text-content-subtle" : "text-red-600 dark:text-red-400"}`}>{ok ? `${n} ${u.toLowerCase()}` : "Agotado"}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <Modal open={!!model} onClose={onClose} title={model.name} width={attrs.length === 2 ? 640 : 480}>
            <div className="space-y-3">
                <div className="-mt-1 flex items-end justify-between gap-3">
                    <div>
                        <Money value={fmt(convertToDisplay(precioModelo), currSym)} className="block text-[20px] font-bold tracking-tight text-content dark:text-white leading-tight" />
                        <p className="text-[12px] text-content-subtle">Toca la que se lleva</p>
                    </div>
                    {data && variantes.length > 0 && (
                        <span className="text-[12px] text-content-subtle tabular-nums pb-0.5">
                            {variantes.filter(disponible).length} de {variantes.length} con existencia
                        </span>
                    )}
                </div>
                {cuerpo}
            </div>
        </Modal>
    );
}
