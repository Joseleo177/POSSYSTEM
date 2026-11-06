// IVA con precios que ya lo incluyen. Espejo de backend/src/services/fiscal/iva.js: el desglose
// del papel y el del Libro de ventas tienen que dar el mismo céntimo.
//
// El impuesto no cambia ningún monto: se calcula sobre el total que se imprime, y bases más IVA
// dan ese total exacto, en la moneda y con el redondeo que tenga el papel.

export const ALICUOTAS = { G: 16, R: 8, A: 31, E: 0 };

// Opciones de la ficha del producto, en el orden en que se eligen más.
export const OPCIONES_IVA = [
    { key: "G", label: "16 %" },
    { key: "E", label: "Exento" },
    { key: "R", label: "8 %" },
    { key: "A", label: "Lujo 31 %" },
];

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Alícuota de una línea del carrito: la del producto (iva_tipo) o, en una cuenta retomada que no
// la trae, la que ya congeló la venta (iva_rate). Sin ninguna, la general.
export const tasaDeLinea = (i) => i?.iva_tipo
    ? (ALICUOTAS[i.iva_tipo] ?? ALICUOTAS.G)
    : (i?.iva_rate != null && i.iva_rate !== "" ? parseFloat(i.iva_rate) : ALICUOTAS.G);

/**
 * Desglose de un total entre sus alícuotas. `lineas`: [{ monto, tasa }], con el neto de cada
 * línea tal como se imprime. Null si ninguna línea trae tasa (factura sin IVA).
 */
export function desgloseIva(lineas, total) {
    if (!lineas?.some(l => l.tasa != null && l.tasa !== "")) return null;
    const T = r2(total);
    const porTasa = new Map();
    for (const l of lineas) {
        const tasa = l.tasa == null || l.tasa === "" ? ALICUOTAS.G : parseFloat(l.tasa);
        porTasa.set(tasa, (porTasa.get(tasa) || 0) + (parseFloat(l.monto) || 0));
    }
    const suma = [...porTasa.values()].reduce((a, m) => a + m, 0);

    const grupos = [...porTasa.entries()]
        .map(([tasa, monto]) => ({ tasa, monto }))
        .sort((a, b) => b.monto - a.monto);
    let repartido = 0;
    for (let i = grupos.length - 1; i >= 1; i--) {
        grupos[i].total = suma > 0 ? r2(T * grupos[i].monto / suma) : 0;
        repartido += grupos[i].total;
    }
    grupos[0].total = r2(T - repartido);

    for (const g of grupos) {
        g.base = g.tasa > 0 ? r2(g.total / (1 + g.tasa / 100)) : g.total;
        g.iva = r2(g.total - g.base);
        delete g.monto;
    }
    grupos.sort((a, b) => b.tasa - a.tasa);

    const gravados = grupos.filter(g => g.tasa > 0);
    return {
        grupos,
        exento: r2(grupos.filter(g => g.tasa === 0).reduce((a, g) => a + g.total, 0)),
        base: r2(gravados.reduce((a, g) => a + g.base, 0)),
        iva: r2(gravados.reduce((a, g) => a + g.iva, 0)),
        total: T,
    };
}

// Alícuotas con columna en el Libro de ventas: la general siempre; la reducida y la de lujo solo
// si el período las usó (casi ninguna tienda vende con ellas).
export function columnasLibro(data) {
    return (data?.columnas || [16]).filter(t => t === 16
        || data?.resumen?.gravado?.[t]?.base || data?.resumen?.gravado?.[t]?.iva);
}

// Renglones del papel: base e IVA de cada alícuota gravada, y el exento si lo hay.
export function renglonesIva(d) {
    if (!d) return [];
    const fmtPct = (t) => `${String(t).replace(".", ",")} %`;
    const out = [];
    for (const g of d.grupos) {
        if (g.tasa > 0) {
            out.push({ label: `Base imponible ${fmtPct(g.tasa)}`, monto: g.base });
            out.push({ label: `IVA ${fmtPct(g.tasa)}`, monto: g.iva });
        }
    }
    if (d.exento > 0) out.push({ label: "Exento", monto: d.exento });
    return out;
}
