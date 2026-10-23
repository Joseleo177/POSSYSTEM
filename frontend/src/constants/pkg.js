// Lista ÚNICA de tipos de empaque para todo el sistema (producto y órdenes de compra).
// Patrón único: MAYÚSCULAS. No duplicar en otros archivos: importar siempre desde aquí.
export const PKG_UNITS = [
    "UNIDAD",
    "CAJA",
    "BULTO",
    "PAQUETE",
    "DOCENA",
    "DISPLAY",
    "MEDIA CAJA",
    "FARDO",
    "SACO",
    "CESTA",
    // Materiales con control por piezas (Fábrica): el empaque es la pieza y su tamaño, el área o
    // el largo de cada una. Lo fija la compra a partir de las medidas.
    "PIEZA",
];
