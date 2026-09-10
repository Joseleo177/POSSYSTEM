/**
 * Calcula el precio de venta sugerido a partir de costo + margen.
 *
 * Va a 5 decimales, que es lo que guarda la columna `price`, y no a 2. El precio en moneda
 * base es una REFERENCIA que se multiplica por la tasa para cobrar en bolívares: recortarlo
 * a dos decimales tira hasta medio centavo de dólar, que a una tasa de 820 son más de 4
 * bolívares por unidad. El comerciante ponía 12% de margen y en la caja le salía otro
 * número. Es también el criterio del backend, que al recibir una compra calcula
 * `unit_cost * (1 + margen/100)` sin redondear: así las dos vías dan el mismo precio.
 *
 * Los ceros de relleno se recortan —2.35000 se muestra 2.35— pero nunca por debajo de dos
 * decimales, para que un precio redondo siga leyéndose como precio.
 *
 * Retorna string, o null si los datos son inválidos.
 * @param {number|string} cost
 * @param {number|string} margin - Porcentaje (ej. 30 = 30%)
 */
export const calcSalePrice = (cost, margin) => {
  const c = parseFloat(cost);
  const m = parseFloat(margin);
  if (!isNaN(c) && c > 0 && !isNaN(m) && m >= 0) {
    return (c * (1 + m / 100)).toFixed(5).replace(/(\.\d{2}\d*?)0+$/, "$1");
  }
  return null;
};

/**
 * Calcula los valores derivados de un ítem de compra (precio unitario, precio venta, totales).
 * @param {object} item - { package_size, package_qty, package_price, profit_margin }
 */
export const calcPurchaseItem = (item) => {
  const pkgSize  = parseFloat(item.package_size)  || 0;
  const pkgQty   = parseFloat(item.package_qty)   || 0;
  const pkgPrice = parseFloat(item.package_price) || 0;

  // Margen vacío significa "no toques el precio de venta", no "margen cero". Hay productos
  // cuyo precio se fija a mano y no sale de aplicarle un porcentaje al costo; leerlo como 0
  // los dejaba vendiéndose justo a lo que costaron.
  const marginRaw = String(item.profit_margin ?? "").trim();
  const margin    = marginRaw === "" ? null : parseFloat(marginRaw);
  const hasMargin = margin !== null && !isNaN(margin);

  if (!pkgSize || !pkgPrice) {
    return { unit_cost: 0, sale_price: null, total_units: 0, subtotal: 0, keepsPrice: !hasMargin };
  }

  const unit_cost   = pkgPrice / pkgSize;
  const sale_price  = hasMargin ? unit_cost * (1 + margin / 100) : null;
  const total_units = pkgQty * pkgSize;
  const subtotal    = pkgQty * pkgPrice;

  // keepsPrice: la compra actualiza el costo y deja el precio de venta como estaba.
  return { unit_cost, sale_price, total_units, subtotal, keepsPrice: !hasMargin };
};
