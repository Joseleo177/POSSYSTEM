import { useState, useEffect, useMemo } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";

// Selección de talla y color de la vitrina, compartida por la ficha del producto (en línea) y
// el selector que abre "Agregar" desde la rejilla. Lo que entra al pedido es la variante
// elegida, nunca el modelo. Solo se sabe si cada una está disponible: la cantidad nunca sale
// de la tienda.
//
// Se elige en cascada, como en cualquier tienda: el primer atributo (el color) se ofrece si
// hay alguna variante disponible con él, y cada siguiente solo mira lo elegido ANTES. Antes
// cada valor se medía contra todo lo elegido, y un color quedaba tachado porque no combinaba
// con la talla del momento aunque tuviera otras tallas: el cliente no podía ni tocarlo.

const coincide = (v, eleccion) => Object.entries(eleccion).every(([a, id]) => v.value_ids[a] === id);

export function useVariantSelection(variants, resetKey) {
    const attrs = useMemo(() => variants?.attributes || [], [variants]);
    const items = useMemo(() => variants?.items || [], [variants]);
    const [sel, setSel] = useState({});

    // Un atributo con un solo valor ya está elegido: no hay nada que preguntar.
    useEffect(() => {
        const ini = {};
        for (const a of attrs) if (a.values.length === 1) ini[a.id] = a.values[0].id;
        setSel(ini);
    }, [resetKey, attrs]);

    // Lo elegido en los atributos anteriores al de la posición idx.
    const previos = (eleccion, idx) => Object.fromEntries(
        attrs.slice(0, idx).filter(a => eleccion[a.id]).map(a => [a.id, eleccion[a.id]])
    );
    const hayCon = (eleccion) => items.some(v => v.available && coincide(v, eleccion));

    const posible = (idx, valueId) => hayCon({ ...previos(sel, idx), [attrs[idx].id]: valueId });

    const elegir = (idx, valueId) => setSel(prev => {
        const next = { ...prev, [attrs[idx].id]: valueId };
        // Lo elegido después que ya no exista con este valor se suelta, en vez de dejar una
        // combinación imposible a la vista.
        attrs.forEach((o, j) => {
            if (j > idx && next[o.id] && !hayCon({ ...previos(next, j), [o.id]: next[o.id] })) delete next[o.id];
        });
        return next;
    });

    const completa = attrs.length > 0 && attrs.every(a => sel[a.id]);
    const elegida = completa ? items.find(v => coincide(v, sel)) || null : null;
    const falta = attrs.find(a => !sel[a.id]) || null;

    // La foto va con el color (o el primer atributo si ninguno se llama así).
    const attrFoto = attrs.find(a => /colou?r/i.test(a.name)) || attrs[0] || null;
    const fotoDeValor = (attrId, valueId) => attrFoto && attrId === attrFoto.id
        ? items.find(v => v.value_ids[attrId] === valueId && v.image_url)?.image_url || null
        : null;
    const foto = elegida?.image_url || (attrFoto && sel[attrFoto.id] ? fotoDeValor(attrFoto.id, sel[attrFoto.id]) : null);

    return { attrs, items, sel, elegir, posible, elegida, falta, foto, fotoDeValor, hayVariantes: attrs.length > 0 };
}

// Fila para el carrito a partir de la variante elegida: misma forma que un producto suelto.
export function lineaDeVariante(product, elegida, foto) {
    return {
        id: elegida.id,
        name: `${product.name} ${elegida.label}`,
        price: elegida.price,
        unit: product.unit,
        image_url: elegida.image_url || foto || product.image_url || null,
        promo_buy_qty: null, promo_get_qty: null,
    };
}

// Los grupos de botones. El valor del atributo de la foto lleva su miniatura: el cliente
// reconoce el color por la foto antes que por el nombre.
export default function VariantOptions({ v }) {
    const { attrs, sel, elegir, posible, fotoDeValor, elegida } = v;
    return (
        <div className="space-y-4">
            {attrs.map((a, idx) => {
                const elegido = a.values.find(x => x.id === sel[a.id]);
                return (
                    <div key={a.id}>
                        <p className="text-[13px] text-content-subtle mb-2">
                            {a.name}
                            {elegido
                                ? <span className="text-content dark:text-white font-medium">: {elegido.value}</span>
                                : <span className="text-content-subtle/70"> · elige uno</span>}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {a.values.map(val => {
                                const on = sel[a.id] === val.id;
                                const ok = posible(idx, val.id);
                                const foto = fotoDeValor(a.id, val.id);
                                return (
                                    <button key={val.id} type="button" disabled={!ok && !on}
                                        onClick={() => elegir(idx, val.id)}
                                        aria-pressed={on}
                                        title={ok || on ? val.value : `${val.value}: agotado`}
                                        className={`h-11 rounded-xl border text-[14px] font-medium inline-flex items-center gap-2 transition-colors ${foto ? "pl-1.5 pr-3.5" : "min-w-[48px] px-3.5 justify-center"} ${on
                                            ? "border-content dark:border-white bg-content text-white dark:bg-white dark:text-surface-dark-2"
                                            : ok
                                                ? "border-border dark:border-white/15 bg-white dark:bg-white/[0.03] text-content dark:text-white hover:border-content/60 dark:hover:border-white/40"
                                                : "border-dashed border-border dark:border-white/[0.12] text-content-subtle/60 cursor-not-allowed"}`}>
                                        {foto && (
                                            <img src={resolveImageUrl(foto)} alt="" onError={imgRetryOnError} loading="lazy"
                                                className={`w-8 h-8 rounded-lg object-cover shrink-0 ${ok || on ? "" : "opacity-40 grayscale"}`} />
                                        )}
                                        <span className={ok || on ? "" : "line-through decoration-1"}>{val.value}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
            {elegida && !elegida.available && (
                <p className="text-[13px] font-medium text-red-600 dark:text-red-400">Esa combinación está agotada.</p>
            )}
        </div>
    );
}
