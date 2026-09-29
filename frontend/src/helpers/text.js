// Partículas que en un nombre propio van en minúscula salvo al inicio: "Rosa de la Cruz".
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "van", "von"]);

/**
 * Pasa a formato de nombre un texto guardado TODO en mayúsculas: "JOSE LUIS DE LA CRUZ" →
 * "Jose Luis de la Cruz". Es solo de presentación, el dato no se toca.
 *
 * Si el texto ya trae minúsculas se devuelve igual: quien lo escribió así decidió cómo se
 * escribe (un "McDonald" o una marca estilizada no se deben aplanar). Las siglas con punto
 * ("C.A.", "S.R.L.") y los tokens con dígitos (RIF, códigos) se dejan como vienen.
 * @param {string} value
 */
export const toNameCase = (value) => {
  if (!value || typeof value !== "string") return value;
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(/(\s+)/)
    .map((tok, i) => {
      if (!tok.trim()) return tok;
      if (tok.includes(".") || /\d/.test(tok)) return tok.toUpperCase();
      if (i > 0 && PARTICULAS.has(tok)) return tok;
      return tok.replace(/(^|[-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    })
    .join("");
};
