/**
 * Criterio único para decidir si una factura está saldada.
 *
 * El sistema lleva dos pistas de redondeo a propósito: `sales.total` es la suma de los
 * precios ya redondeados a 2 decimales por línea, mientras que el cobro en bolívares trabaja
 * con los subtotales precisos (5 decimales). En una venta de 3 unidades a 4.06569 eso da
 * 12.21 contra 12.197053: el cliente pagó todo, pero los dos números no son iguales.
 *
 * Por eso la comparación admite una tolerancia de diez céntimos de dólar —la misma que usa
 * el registro de pagos desde siempre— en vez de exigir igualdad al centavo. Con un céntimo
 * de margen, una factura pagada completa quedaba como 'parcial' arrastrando una deuda de
 * 0.0129 que no existe.
 *
 * Vive aparte para que las tres rutas que tocan el estado —cobrar, quitar un pago y anular
 * una nota de crédito— no se desalineen otra vez.
 */
const PAYMENT_TOLERANCE = 0.10;

/**
 * Estado que le corresponde a una factura según lo cobrado y lo acreditado por devoluciones.
 *
 * No decide sobre 'anulado', 'devuelto', 'espera' ni 'pedido': esos los fija otro flujo y
 * quien llama debe respetarlos.
 */
function resolveSaleStatus({ saleTotal, paid, returned = 0, hasInvoice = true }) {
  const total = parseFloat(saleTotal) || 0;
  const cobrado = parseFloat(paid) || 0;
  const acreditado = parseFloat(returned) || 0;
  // Lo que realmente queda por cobrar descuenta las devoluciones vivas.
  const porCobrar = Math.max(0, total - acreditado);

  if (porCobrar <= PAYMENT_TOLERANCE) return "pagado";
  if (cobrado <= 0) return hasInvoice ? "pendiente" : "borrador";
  if (cobrado >= porCobrar - PAYMENT_TOLERANCE) return "pagado";
  return "parcial";
}

module.exports = { PAYMENT_TOLERANCE, resolveSaleStatus };
