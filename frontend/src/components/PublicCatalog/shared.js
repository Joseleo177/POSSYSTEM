// Piezas comunes del catálogo público. Vivían sueltas dentro de PublicCatalogPage, que era el
// único archivo del módulo: al repartir la página en componentes había que dejarlas en un sitio
// del que todos pudieran tomarlas sin importarse entre sí.

export const PAGE_SIZE = 24;

// Sumar 0,5 repetidas veces en coma flotante deja colas del tipo 1.7999999999; el
// inventario del sistema trabaja con 3 decimales, así que se recorta a lo mismo.
export const round3 = (n) => Math.round(n * 1000) / 1000;

// Misma convención de documento que el POS (ver Customers/CustomerModal): prefijo, guion
// y solo dígitos. J y G son RIF jurídicos y llevan uno más.
export const DOC_PREFIXES = ["V", "E", "J", "G", "P"];
export const docMaxLen = (prefix) => (["J", "G"].includes(prefix) ? 9 : 8);

// Colores del estado. "rechazado" no viene del servidor: lo deduce el navegador cuando un
// pedido que envió ya no aparece en la lista (ver rejectedIds).
export const STAGE_STYLES = {
    enviado:    "bg-warning/15 text-warning border-warning/30",
    confirmado: "bg-info/15 text-info border-info/30",
    facturado:  "bg-brand-500/15 text-brand-500 border-brand-500/30",
    pagado:     "bg-success/15 text-success border-success/30",
    anulado:    "bg-danger/15 text-danger border-danger/30",
    rechazado:  "bg-danger/15 text-danger border-danger/30",
};

// Cantidades: enteras para unidades contables, 3 decimales para peso y volumen. Aquí no
// llega la unidad del producto, así que se decide por el propio número.
export const fmtQty = (q) => (q % 1 === 0 ? String(q) : q.toFixed(3));
