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
// `pill` es el fondo de la pastilla que usa la carta del tema de menú (ver StageMark).
export const STAGE_TONE = {
    enviado:    { dot: "bg-sky-500",   text: "text-sky-700 dark:text-sky-400",         pill: "bg-sky-500/10" },
    confirmado: { dot: "bg-sky-500",   text: "text-sky-700 dark:text-sky-400",         pill: "bg-sky-500/10" },
    facturado:  { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400",     pill: "bg-amber-500/15" },
    pagado:     { check: true,         text: "text-emerald-700 dark:text-emerald-400", pill: "bg-emerald-500/15" },
    // Despacho del pedido web (ver etapaCliente en el backend).
    listo:      { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-400",  pill: "bg-violet-500/10" },
    en_camino:  { dot: "bg-sky-500",   text: "text-sky-700 dark:text-sky-400",         pill: "bg-sky-500/10" },
    entregado:  { check: true,         text: "text-emerald-700 dark:text-emerald-400", pill: "bg-emerald-500/15" },
    anulado:    { dot: "bg-neutral-400", text: "text-neutral-500",                     pill: "bg-black/[0.05]" },
    rechazado:  { dot: "bg-red-500",   text: "text-red-600 dark:text-red-400",         pill: "bg-red-500/10" },
};

// Estado de un pago que el cliente reportó. Ámbar mientras la tienda no lo ve en su banco,
// verde con visto cuando ya lo vio, rojo si lo rechazó (con el motivo debajo).
export const PAYMENT_TONE = {
    pendiente:  { label: "Por confirmar", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    confirmado: { label: "Confirmado", check: true, text: "text-emerald-700 dark:text-emerald-400" },
    rechazado:  { label: "Rechazado", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
};

// Campo de los formularios del catálogo. 16 px en el teléfono: con menos, Safari de iOS
// acerca la página al tocar el campo y el cliente queda con la vista desencuadrada.
export const FIELD = "w-full h-11 px-3.5 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[16px] sm:text-[14px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder:text-content-subtle";
export const FIELD_LABEL = "text-[12px] font-medium text-content-subtle";

// Cantidades: enteras para unidades contables, 3 decimales para peso y volumen. Aquí no
// llega la unidad del producto, así que se decide por el propio número.
export const fmtQty = (q) => (q % 1 === 0 ? String(q) : q.toFixed(3));

// Color de papel por defecto del tema de menú, cuando la tienda no eligió uno en Ajustes →
// Vitrina. Las hojas compartidas lo usan para la piel "carta" (ver CatalogSheet).
export const MENU_PANEL_DEFAULT = "#F4FAF6";
