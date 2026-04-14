/**
 * Formatea una cantidad según su unidad de medida.
 * @param {number|string} qty - Cantidad numérica
 * @param {string} unit - Unidad (KG, L, M, UNIDAD, etc.)
 */
export const fmtQtyUnit = (qty, unit) => {
    const n = parseFloat(qty || 0);
    const u = (unit || "").toUpperCase();

    // Unidades de peso/volumen suelen llevar 3 decimales
    const isWeighted = ["KG", "KILOGRAMO", "L", "LITRO", "M", "METRO"].includes(u);
    
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
