/**
 * Un céntimo en moneda base: umbral de sobrantes y redondeos de pantalla. Debe valer lo mismo
 * que PAYMENT_TOLERANCE en backend/src/utils/saleBalance.js.
 */
export const PAYMENT_TOLERANCE = 0.01;

/**
 * Margen con el que el servidor da por saldada ESTA factura, en moneda base: medio céntimo más
 * el desfase entre `sales.total` (precios redondeados por línea) y la suma precisa de sus
 * líneas, que es lo que se cobra en bolívares. Copia de settleTolerance en
 * backend/src/utils/saleBalance.js — si la pantalla usa otro número, anuncia un resultado
 * distinto del que el servidor va a registrar.
 *
 * Antes era un $0,10 fijo: a la tasa del día, una factura se cerraba debiendo hasta Bs.85.
 */
export const settleTolerance = (sale) => {
  const total = parseFloat(sale?.total) || 0;
  const lineas = parseFloat(sale?.total_precise);
  if (!Number.isFinite(lineas)) return 0.005;
  const preciso = lineas - (parseFloat(sale?.discount_amount) || 0) + (parseFloat(sale?.service_charge) || 0);
  return 0.005 + Math.max(0, total - Math.max(0, preciso));
};

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
 * Total de una venta convertido a una tasa, con la MISMA regla que el carrito:
 * el precio neto de cada línea se redondea a 2 decimales YA CONVERTIDO y recién
 * entonces se multiplica por la cantidad; el descuento de la factura se resta también
 * convertido y redondeado.
 *
 * No sirve multiplicar el total en moneda base por la tasa: ese total se armó
 * redondeando cada línea en $ (round2(precio) × qty), así que la conversión arrastra
 * ese residuo y da un número distinto al que se cobra — Bs.54383.84 en el modal de
 * venta contra los Bs.54381.93 del modal de pago, sobre la misma factura.
 *
 * Sin tasa (moneda base) o sin líneas no hay conversión por línea que aplicar: se
 * devuelve el total oficial de la factura, que es la fuente de verdad en divisas.
 *
 * El recargo de cabecera (propina/servicio) entra igual que el descuento pero sumando: es un
 * monto de la factura, no una línea, así que se convierte y redondea una sola vez al final.
 * Es el espejo exacto de totalBsAt() en el backend (services/payments/createPayment.js): si
 * uno de los dos suma el recargo y el otro no, la factura nunca cierra en bolívares.
 *
 * @param {object} sale - Venta con { total, discount_amount, service_charge, items[{ price, discount, quantity }] }
 * @param {number} rate - Tasa a la que convertir
 */
// Neto de una línea de factura a una tasa, con un solo redondeo por línea. Sin descuento manual
// es la cuenta de siempre (neto por unidad redondeado × cantidad), la de todas las facturas
// previas. Con descuento manual se resta el de la LÍNEA entera: repartido por unidad, 200 Bs
// entre 12 unidades no cabe en céntimos y la línea salía 8 céntimos lejos de lo tecleado.
// Espejo de netoLineaEnTasa en backend/src/services/sales/lineDiscount.js y de la pista en
// bolívares de CartContext.
export const netoLineaEnTasa = (i, rate) => {
  const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  const r = parseFloat(rate) || 1;
  const qty = parseFloat(i.quantity ?? i.qty ?? 0);
  const price = parseFloat(i.price || 0);
  const value = parseFloat(i.line_discount_value);
  if (i.line_discount_mode && value > 0) {
    const bruto = round2(price * r) * qty;
    const desc = i.line_discount_mode === "amount" ? Math.min(round2(value * r), bruto) : bruto * value / 100;
    return round2(bruto - desc);
  }
  return round2((price - parseFloat(i.discount || 0)) * r) * qty;
};

export const saleTotalAtRate = (sale, rate) => {
  const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
  const r = parseFloat(rate) || 1;
  const items = sale?.items || [];
  if (!(r > 1) || !items.length) return round2(parseFloat(sale?.total || 0) * r);

  const lines = items.reduce((acc, i) => acc + netoLineaEnTasa(i, r), 0);
  return round2(
    lines
    - round2(parseFloat(sale?.discount_amount || 0) * r)
    + round2(parseFloat(sale?.service_charge || 0) * r)
  );
};

/**
 * Formatea una tasa de cambio con precisión configurable.
 * @param {number} rate
 * @param {number} decimals
 */
export const fmtRate = (rate, decimals = 4) =>
  parseFloat(rate || 0).toFixed(decimals);
