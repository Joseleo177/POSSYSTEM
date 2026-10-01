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

// Tono de cada estado, con la misma lectura que el resto del sistema (ui/StatusMark): un punto
// y el texto, sin pastilla. El color es señal: azul lo que está en curso, ámbar lo que espera
// el pago, verde con su visto lo pagado, gris lo anulado y rojo lo que la tienda no procesó.
// Antes "facturado" iba en el color de la tienda, que no le decía al cliente nada.
// "rechazado" no viene del servidor: lo deduce el navegador cuando un pedido que envió ya no
// aparece en la lista (ver rejectedIds).
export const STAGE_TONE = {
    enviado:    { dot: "bg-sky-500",   text: "text-sky-700 dark:text-sky-400" },
    confirmado: { dot: "bg-sky-500",   text: "text-sky-700 dark:text-sky-400" },
    facturado:  { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    pagado:     { check: true,         text: "text-emerald-700 dark:text-emerald-400" },
    anulado:    { dot: "bg-content-subtle/60", text: "text-content-subtle" },
    rechazado:  { dot: "bg-red-500",   text: "text-red-600 dark:text-red-400" },
};

// Cantidades: enteras para unidades contables, 3 decimales para peso y volumen. Aquí no
// llega la unidad del producto, así que se decide por el propio número.
export const fmtQty = (q) => (q % 1 === 0 ? String(q) : q.toFixed(3));
