// Identidad de una línea del carrito de la caja.
//
// Una línea normal se identifica por su producto (`id`), como siempre: agregar dos veces el
// mismo producto suma sobre la misma línea. Un plato con adicionales necesita ser su propia
// línea —dos hamburguesas, una término medio y otra bien cocida, no son la misma—, así que
// lleva `key` propia, y sus extras con precio ("+ Tocineta") llevan `parentKey` apuntando a él:
// siguen su cantidad y se van con él al quitarlo.
//
// Toda operación sobre una línea (cantidad, quitar, descuento) va por esta clave, nunca por el
// producto: con adicionales, el mismo producto puede estar en varias líneas.
export const cartKey = (line) => line.key ?? line.id;

// "Término medio · + Tocineta": cómo se leen los adicionales elegidos.
export const textoAdicionales = (opts) => (opts || []).map(o => (o.price > 0 ? `+ ${o.name}` : o.name)).join(" · ");
