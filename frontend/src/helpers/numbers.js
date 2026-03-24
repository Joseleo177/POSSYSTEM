/**
 * Formatea un número con separadores de miles (locale Venezuela).
 * @param {number} n
 * @param {number} decimals - Decimales (default 2)
 */
export const fmtNumber = (n, decimals = 2) =>
  parseFloat(n || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Formatea un entero con separadores de miles.
 * @param {number} n
 */
export const fmtInt = (n) =>
  parseInt(n || 0).toLocaleString("es-VE");

/**
 * Formatea una cantidad de stock (3 decimales si tiene fracción, 0 si es entero).
 * @param {number|string} qty
 */
export const fmtQty = (qty) => {
  const n = parseFloat(qty || 0);
  return n.toFixed(n % 1 !== 0 ? 3 : 0);
};

/**
 * Parsea un string de monto que puede tener coma o punto como decimal.
 * @param {string} str
 */
export const parseAmount = (str) =>
  parseFloat(String(str || "0").replace(",", ".")) || 0;
