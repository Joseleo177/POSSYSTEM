// IVA con precios que ya lo incluyen. Espejo de backend/src/services/fiscal/iva.js: el desglose
// del papel y el del Libro de ventas tienen que dar el mismo céntimo.
//
// El impuesto no cambia ningún monto: se calcula sobre el total que se imprime, línea por línea con
// la regla de la imprenta digital (HKA): base a céntimos e IVA = redondeo(base × alícuota / 100).

export const ALICUOTAS = { G: 16, R: 8, A: 31, E: 0 };

// Opciones de la ficha del producto, en el orden en que se eligen más.
export const OPCIONES_IVA = [
    { key: "G", label: "16 %" },
    { key: "E", label: "Exento" },
    { key: "R", label: "8 %" },
    { key: "A", label: "Lujo 31 %" },
];

// Redondeo de HKA: mitad hacia arriba sobre el decimal que se ve (0,155 → 0,16), no sobre el binario.
function R(valor) {
    const n = Number(valor) || 0;
    const s = String(Math.abs(n));
    if (/e/i.test(s)) return Math.round(n * 100) / 100;
    const [entero, decimales = ""] = s.split(".");
    let centimos = Number(entero) * 100 + Number((decimales + "00").slice(0, 2));
    if ((decimales[2] || "0") >= "5") centimos += 1;
    return (n < 0 ? -centimos : centimos) / 100;
}

const totalLinea = (base, tasa) => R(base + R(base * tasa / 100));

function repartir(monto, bases) {
    const suma = bases.reduce((a, b) => a + b, 0);
    if (!monto || suma <= 0) return bases.map(() => 0);
    const partes = bases.map(b => R(monto * b / suma));
    const residuo = R(monto - partes.reduce((a, p) => a + p, 0));
    if (residuo) {
        const mayor = bases.indexOf(Math.max(...bases));
        partes[mayor] = R(partes[mayor] + residuo);
    }
    return partes;
}

// Alícuota de una línea del carrito: la del producto (iva_tipo) o, en una cuenta retomada que no
// la trae, la que ya congeló la venta (iva_rate). Sin ninguna, la general.
export const tasaDeLinea = (i) => i?.iva_tipo
    ? (ALICUOTAS[i.iva_tipo] ?? ALICUOTAS.G)
    : (i?.iva_rate != null && i.iva_rate !== "" ? parseFloat(i.iva_rate) : ALICUOTAS.G);

/**
 * Desglose de un total entre sus alícuotas, línea por línea como HKA. `lineas`: [{ monto, tasa }],
 * con el neto de cada línea tal como se imprime. Null si ninguna línea trae tasa (factura sin IVA).
 * Los céntimos que el redondeo por línea no deja cuadrar pasan a otra línea; `ajuste` (casi siempre
 * 0) es lo que difiere lo fiscal de lo cobrado cuando no hay dónde ponerlos. Ver el backend.
 */
export function desgloseIva(lineas, total) {
    if (!lineas?.some(l => l.tasa != null && l.tasa !== "")) return null;
    const T = R(total);
    const ls = lineas.map(l => ({
        tasa: l.tasa == null || l.tasa === "" ? ALICUOTAS.G : parseFloat(l.tasa),
        monto: Math.max(0, parseFloat(l.monto) || 0),
    }));

    const objetivo = repartir(T, ls.map(l => l.monto));
    ls.forEach((l, i) => {
        l.base = l.tasa > 0 ? R(objetivo[i] / (1 + l.tasa / 100)) : objetivo[i];
        l.total = totalLinea(l.base, l.tasa);
    });

    const orden = ls.map((_, i) => i)
        .sort((a, b) => (ls[a].tasa > 0 ? 0 : 1) - (ls[b].tasa > 0 ? 0 : 1) || objetivo[b] - objetivo[a]);
    const delta = (i, paso) => R(totalLinea(R(ls[i].base + paso), ls[i].tasa) - ls[i].total);
    const mover = (i, paso) => {
        ls[i].base = R(ls[i].base + paso);
        ls[i].total = totalLinea(ls[i].base, ls[i].tasa);
    };
    const posible = (i, paso) => R(ls[i].base + paso) >= 0;
    let D = R(T - ls.reduce((a, l) => a + l.total, 0));
    for (let vuelta = 0; D !== 0 && vuelta < ls.length * 4 + 4; vuelta++) {
        const paso = D > 0 ? 0.01 : -0.01;
        const uno = orden.find(i => posible(i, paso) && delta(i, paso) === paso);
        if (uno !== undefined) { mover(uno, paso); D = R(D - paso); continue; }
        let par = null;
        for (const a of orden) {
            if (!posible(a, paso) || delta(a, paso) !== R(2 * paso)) continue;
            const b = orden.find(j => j !== a && posible(j, -paso) && delta(j, -paso) === -paso);
            if (b !== undefined) { par = [a, b]; break; }
        }
        if (!par) break;
        mover(par[0], paso);
        mover(par[1], -paso);
        D = R(D - paso);
    }

    const porTasa = new Map();
    for (const l of ls) {
        l.iva = R(l.total - l.base);
        const g = porTasa.get(l.tasa) || { tasa: l.tasa, base: 0, iva: 0 };
        g.base = R(g.base + l.base);
        g.iva = R(g.iva + l.iva);
        porTasa.set(l.tasa, g);
    }
    const grupos = [...porTasa.values()]
        .map(g => ({ ...g, total: R(g.base + g.iva) }))
        .sort((a, b) => b.tasa - a.tasa);
    const gravados = grupos.filter(g => g.tasa > 0);
    const fiscal = R(grupos.reduce((a, g) => a + g.total, 0));
    return {
        grupos,
        lineas: ls.map(({ tasa, base, iva, total: t }) => ({ tasa, base, iva, total: t })),
        exento: R(grupos.filter(g => g.tasa === 0).reduce((a, g) => a + g.total, 0)),
        base: R(gravados.reduce((a, g) => a + g.base, 0)),
        iva: R(gravados.reduce((a, g) => a + g.iva, 0)),
        total: fiscal,
        ajuste: R(fiscal - T),
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
    // El céntimo que el redondeo por línea no deja cuadrar (una sola línea gravada): dicho aparte, los
    // renglones suman lo que dice el TOTAL.
    if (d.ajuste) out.push({ label: "Redondeo del IVA", monto: -d.ajuste });
    return out;
}
