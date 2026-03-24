/**
 * Retorna clases Tailwind de color según el nivel de stock.
 * @param {number|string} qty
 */
export const stockColorClass = (qty) => {
  const n = parseFloat(qty || 0);
  if (n <= 0) return "text-danger";
  if (n <= 5)  return "text-warning";
  return "text-success";
};

/**
 * Retorna true si el producto tiene stock suficiente para vender.
 * Los servicios (is_service=true) siempre tienen stock.
 * @param {object} product - { stock, is_service }
 */
export const canSell = (product) =>
  product.is_service || parseFloat(product.stock || 0) > 0;
