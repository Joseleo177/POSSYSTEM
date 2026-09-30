// Cómo se nombra y se dibuja cada movimiento de inventario. Lo comparten el kardex (Movimientos),
// su ventana y el panel de Movimiento manual.
import { isIntegerUnit } from "../../helpers/unitFormatter";
import { toNameCase } from "../../helpers";

export const ICON = {
    cart:     "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    truck:    "M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1",
    back:     "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
    swap:     "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    sliders:  "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
    ban:      "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    box:      "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    search:   "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    clock:    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    close:    "M6 18L18 6M6 6l12 12",
};

// Motivos de las líneas de sesión: los que se eligen en Movimiento manual y los que pone el
// sistema (ajuste directo desde Stock, alta con stock, retiro, recepción de compras).
export const REASON_LABELS = {
    merma:          "Merma",
    vencimiento:    "Producto vencido",
    consumo:        "Consumo interno",
    robo:           "Robo o pérdida",
    conteo:         "Conteo físico",
    compra:         "Entrada por compra",
    devolucion:     "Devolución de cliente",
    transferencia:  "Transferencia recibida",
    produccion:     "Producción interna",
    ajuste_directo: "Ajuste directo",
    carga_inicial:  "Carga inicial",
    retiro:         "Retiro del almacén",
    compra_anulada: "Compra anulada",
};
export const reasonLabel = (r) => REASON_LABELS[r] || (r ? toNameCase(String(r).replace(/_/g, " ")) : "Ajuste");

// Pestañas del kardex, en el orden en que se leen.
export const GROUPS = [
    { key: "venta",         label: "Ventas" },
    { key: "compra",        label: "Compras" },
    { key: "devolucion",    label: "Devoluciones" },
    { key: "transferencia", label: "Transferencias" },
    { key: "ajuste",        label: "Ajustes" },
];

// Título, documento y contraparte de una fila del kardex.
export function describe(m) {
    const doc = m.doc || null;
    switch (m.kind) {
        case "venta":
            return {
                icon: ICON.cart,
                title: m.doc_status === "espera" ? "Cuenta en espera" : "Venta",
                doc: doc || (m.doc_status === "espera" ? null : "Sin número"),
                party: m.party ? toNameCase(m.party) : "Consumidor final",
                extra: m.via ? `En el combo ${toNameCase(m.via)}` : null,
            };
        case "devolucion":
            return { icon: ICON.back, title: "Devolución", doc, party: m.party ? toNameCase(m.party) : null, extra: m.via ? `Combo ${toNameCase(m.via)}` : m.reason };
        case "devolucion_anulada":
            return { icon: ICON.ban, title: "Nota de crédito anulada", doc, party: m.party ? toNameCase(m.party) : null, extra: null };
        case "compra":
            return { icon: ICON.truck, title: "Compra", doc, party: m.party ? toNameCase(m.party) : null, extra: null };
        case "compra_anulada":
            return { icon: ICON.ban, title: "Compra anulada", doc, party: m.party ? toNameCase(m.party) : null, extra: null };
        case "transferencia_salida":
            return { icon: ICON.swap, title: "Transferencia enviada", doc, party: m.party ? `A ${m.party}` : null, extra: m.notes };
        case "transferencia_entrada":
            return { icon: ICON.swap, title: "Transferencia recibida", doc, party: m.party ? `De ${m.party}` : null, extra: m.notes };
        case "transferencia_retorno":
            return { icon: ICON.swap, title: "Faltante devuelto", doc, party: m.party ? `No llegó a ${m.party}` : null, extra: m.notes };
        case "transferencia_anulada":
            return { icon: ICON.ban, title: "Transferencia anulada", doc, party: m.party ? `Iba a ${m.party}` : null, extra: m.notes };
        default:
            return { icon: ICON.sliders, title: reasonLabel(m.reason), doc: "Ajuste manual", party: null, extra: m.notes };
    }
}

// Cantidades en formato venezolano: miles con punto y decimales con coma. Las unidades
// contables van enteras; peso y volumen hasta 3 decimales, sin ceros de relleno.
export function fmtCant(n, unit) {
    const v = Math.abs(Number(n) || 0);
    return v.toLocaleString("es-VE", { maximumFractionDigits: isIntegerUnit(unit) ? 0 : 3 });
}

// Unidad corta para acompañar una cifra: "unidades", "kg", "l".
export function unidadCorta(unit, n = 2) {
    const u = String(unit || "").toUpperCase();
    if (!u || u === "UNIDAD") return Math.abs(n) === 1 ? "unidad" : "unidades";
    if (u === "KILOGRAMO") return "kg";
    if (u === "LITRO") return "l";
    if (u === "METRO") return "m";
    return u.toLowerCase();
}

export const fmtHora = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
};
