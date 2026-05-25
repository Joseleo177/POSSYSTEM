/**
 * Formatea un número con símbolo de moneda.
 * Los símbolos de más de un carácter (ej. "Ref.", "Bs.") llevan espacio.
 * @param {number} n - Monto
 * @param {string} symbol - Símbolo de moneda (default "Ref.")
 */
export const fmtMoney = (n, symbol = "Ref.") => {
  const sep = symbol.length > 1 ? " " : "";
  return `${symbol}${sep}${Number(n || 0).toFixed(2)}`;
};

/**
 * Formatea un monto en la moneda base.
 * @param {number} n - Monto en moneda base
 * @param {object} baseCurrency - Objeto de moneda base { symbol }
 */
export const fmtBase = (n, baseCurrency) =>
  fmtMoney(n, baseCurrency?.symbol || "Ref.");

/**
 * Formatea un monto de venta según su moneda (base o alternativa).
 * Si la venta es en moneda alternativa, convierte usando su tasa.
 * @param {object} sale - Objeto venta con { currency_id, currency_symbol, exchange_rate }
 * @param {number} amount - Monto en moneda base (USD)
 * @param {object} baseCurrency - Moneda base
 */
export const fmtSale = (sale, amount, baseCurrency) => {
  const isBase = !sale.currency_id || sale.currency_id === baseCurrency?.id;
  if (isBase) return fmtBase(amount, baseCurrency);
  const sym  = sale.currency_symbol || "Bs.";
  const rate = parseFloat(sale.exchange_rate) || 1;
  return fmtMoney(parseFloat(amount || 0) * rate, sym);
};

/**
 * Formatea un pago en la moneda con que fue realizado.
 * amount está en base (USD), × exchange_rate = moneda del pago.
 * @param {object} pay - Pago con { currency_code, currency_symbol, exchange_rate, amount }
 * @param {object} baseCurrency - Moneda base
 */
export const fmtPayment = (pay, baseCurrency) => {
  const isBase = !pay.currency_code || pay.currency_code === baseCurrency?.code;
  if (isBase) return fmtBase(pay.amount, baseCurrency);
  const sym  = pay.currency_symbol || "Bs.";
  const rate = parseFloat(pay.exchange_rate) || 1;
  return fmtMoney(parseFloat(pay.amount || 0) * rate, sym);
};

/**
 * Convierte un monto de moneda base a moneda de display.
 * @param {number} amountBase - Monto en moneda base
 * @param {object} currency - Moneda de display { is_base, exchange_rate }
 */
export const convertToDisplay = (amountBase, currency) => {
  if (!currency || currency.is_base) return parseFloat(amountBase || 0);
  return parseFloat(amountBase || 0) * parseFloat(currency.exchange_rate || 1);
};

/**
 * Formatea una tasa de cambio con precisión configurable.
 * @param {number} rate
 * @param {number} decimals
 */
export const fmtRate = (rate, decimals = 4) =>
  parseFloat(rate || 0).toFixed(decimals);
