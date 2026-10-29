import { isIntegerUnit } from "../../helpers/unitFormatter";

// Piezas comunes de la app Recetas.

// "32,4 %", como se escribe un porcentaje en Venezuela.
export const fmtPct = (n) => `${Number(n || 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} %`;

// El color es señal: rojo cuando el plato pasa la meta, ámbar cuando le quedan menos de 3
// puntos. Lo normal va sin color (null).
export const foodCostTone = (pct, meta) => {
    if (pct == null) return null;
    if (pct > meta) return "text-red-600 dark:text-red-400";
    if (pct > meta - 3) return "text-amber-700 dark:text-amber-400";
    return null;
};

// Lo que va al plato se escribe como se piensa en la cocina: 250 g de lomo, 30 ml de salsa,
// 2 arepas. Se guarda en la unidad del insumo (0,250 KG). g y ml van enteros: el sistema
// guarda 3 decimales del kilo, que es el gramo. Mismo criterio que los adicionales.
export const medida = (unit) => {
    const u = String(unit || "").toUpperCase();
    if (u === "KG" || u === "KILOGRAMO") return { f: 1000, suf: "g", por: "kg", entero: true, merma: true };
    if (u === "L" || u === "LITRO") return { f: 1000, suf: "ml", por: "litro", entero: true, merma: true };
    if (u === "PORCION") return { f: 1, suf: "porc.", por: "porción", entero: true, merma: false };
    if (isIntegerUnit(u)) return { f: 1, suf: "und", por: "unidad", entero: true, merma: false };
    return { f: 1, suf: u.toLowerCase(), por: u.toLowerCase(), entero: false, merma: true };
};

// Una olla se piensa en kilos y litros, no en gramos: 5 kg de carne, 0,2 kg de sal.
export const medidaTanda = (unit) => {
    const u = String(unit || "").toUpperCase();
    if (u === "KG" || u === "KILOGRAMO") return { f: 1, suf: "kg", por: "kg", entero: false, merma: true };
    if (u === "L" || u === "LITRO") return { f: 1, suf: "l", por: "litro", entero: false, merma: true };
    return medida(unit);
};

// En qué se cuenta lo que sale de una preparación.
export const UNIDADES_PREP = [
    { key: "PORCION", label: "Porciones", suf: "porc." },
    { key: "KG",      label: "Kilos",     suf: "kg" },
    { key: "LITRO",   label: "Litros",    suf: "l" },
    { key: "UNIDAD",  label: "Unidades",  suf: "und" },
];

// "28 porciones", "4,5 l": lo que rinde o hay de una preparación.
export const fmtRinde = (q, unit) => {
    const u = String(unit || "").toUpperCase();
    const n = Number(q || 0);
    const txt = n.toLocaleString("es-VE", { maximumFractionDigits: isIntegerUnit(u) ? 0 : 3 });
    if (u === "PORCION") return `${txt} ${n === 1 ? "porción" : "porciones"}`;
    if (u === "KG" || u === "KILOGRAMO") return `${txt} kg`;
    if (u === "L" || u === "LITRO") return `${txt} l`;
    return `${txt} ${n === 1 ? "unidad" : "unidades"}`;
};

// Cantidad de una tanda tal como se escribe ("5", "0,25"), y de vuelta a número.
export const fmtTanda = (q, unit) => {
    const m = medidaTanda(unit);
    const v = Math.round(q * m.f * 1000) / 1000;
    return `${v.toLocaleString("es-VE", { maximumFractionDigits: m.entero ? 0 : 3 })} ${m.suf}`;
};

const round3 = (n) => Math.round(n * 1000) / 1000;

export const num = (texto) => parseFloat(String(texto ?? "").replace(",", ".")) || 0;
export const aTexto = (n) => String(n ?? "").replace(".", ",");

// Lo que se descuenta por plato: el neto más la merma, redondeado como lo guarda el servidor
// (services/recipes.js). Lo contable no lleva merma.
export const bruto = (neto, merma, unit) => {
    const m = medida(unit);
    if (!m.merma) return neto;
    const w = Math.min(Math.max(merma || 0, 0), 94.99);
    return round3(neto / (1 - w / 100));
};

// "313 g", "1,2 l" no: g y ml siempre enteros.
export const fmtCantidad = (q, unit) => {
    const m = medida(unit);
    const v = Math.round(q * m.f * 1000) / 1000;
    return `${v.toLocaleString("es-VE", { maximumFractionDigits: m.entero ? 0 : 3 })} ${m.suf}`;
};
