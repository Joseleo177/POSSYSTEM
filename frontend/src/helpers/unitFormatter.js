// Unidades de peso/volumen (admiten decimales). El resto son contables (enteras).
export const WEIGHTED_UNITS = ["KG", "KILOGRAMO", "L", "LITRO", "M", "METRO"];

// true si la unidad es contable (UNIDAD, etc.) → cantidades estrictamente enteras.
export const isIntegerUnit = (unit) => !WEIGHTED_UNITS.includes((unit || "").toUpperCase());

// Plurales de las unidades escritas (las abreviaturas KG/L/M no se pluralizan)
const UNIT_PLURALS = {
    UNIDAD:    "UNIDADES",
    LITRO:     "LITROS",
    METRO:     "METROS",
    KILOGRAMO: "KILOGRAMOS",
};

/**
 * Formatea una cantidad según su unidad de medida.
 * Pluraliza la unidad cuando la cantidad ≠ 1 ("19 UNIDADES", "1 UNIDAD").
 * @param {number|string} qty - Cantidad numérica
 * @param {string} unit - Unidad (KG, L, M, UNIDAD, etc.)
 */
export const fmtQtyUnit = (qty, unit) => {
    const n = parseFloat(qty || 0);
    let u = (unit || "").toUpperCase();
    if (n !== 1 && UNIT_PLURALS[u]) u = UNIT_PLURALS[u];

    // Unidades de peso/volumen suelen llevar 3 decimales
    const isWeighted = WEIGHTED_UNITS.includes((unit || "").toUpperCase());

    if (isWeighted) {
        return n.toLocaleString("es-VE", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
        }) + " " + u;
    }

    // Unidades contables (estrictamente enteros)
    return n.toLocaleString("es-VE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }) + " " + u;
};
