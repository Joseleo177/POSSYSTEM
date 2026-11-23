// Principios activos de un medicamento (módulo Farmacia). Espejo de backend/src/utils/principios.js:
// varios principios se guardan en el mismo campo unidos por " + " ("Loratadina + Pseudoefedrina");
// al leer también valen "/" y ";".

const SEPARADOR = /\s*(?:\+|\/|;)\s*/;

export const normPrincipio = (s) => String(s || "").trim().replace(/\s+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Loratadina + pseudoefedrina" → ["Loratadina", "pseudoefedrina"] (sin repetidos). */
export function separarPrincipios(texto) {
    const vistos = new Set();
    const out = [];
    for (const p of String(texto || "").split(SEPARADOR)) {
        const limpio = p.trim().replace(/\s+/g, " ");
        const k = normPrincipio(limpio);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        out.push(limpio);
    }
    return out;
}

/** Lista → texto para guardar ("A + B"), o "" si no hay ninguno. */
export const unirPrincipios = (lista) => separarPrincipios((lista || []).join(" + ")).join(" + ");
