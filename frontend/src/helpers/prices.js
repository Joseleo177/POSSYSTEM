/**
 * Calcula el precio de venta sugerido a partir de costo + margen.
 * Retorna string con 2 decimales, o null si los datos son inválidos.
 * @param {number|string} cost
 * @param {number|string} margin - Porcentaje (ej. 30 = 30%)
 */
export const calcSalePrice = (cost, margin) => {
  const c = parseFloat(cost);
  const m = parseFloat(margin);
  if (!isNaN(c) && c > 0 && !isNaN(m) && m >= 0) {
    return (c * (1 + m / 100)).toFixed(2);
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
  const margin   = parseFloat(item.profit_margin) || 0;

  if (!pkgSize || !pkgPrice) {
    return { unit_cost: 0, sale_price: 0, total_units: 0, subtotal: 0 };
  }

  const unit_cost   = pkgPrice / pkgSize;
  const sale_price  = unit_cost * (1 + margin / 100);
  const total_units = pkgQty * pkgSize;
  const subtotal    = pkgQty * pkgPrice;

  return { unit_cost, sale_price, total_units, subtotal };
};
