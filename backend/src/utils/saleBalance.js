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
 * Facturas cerradas: ya no se les cobra nada.
 *
 * 'exonerado' vive acá junto a 'pagado' porque la venta ocurrió igual —la mercancía salió y el
 * documento se emitió—, solo que el saldo se perdonó en vez de cobrarse. Los reportes de lo
 * VENDIDO (ventas, productos, márgenes, clientes, auditoría) usan esta lista para contarlas
 * juntas; los de DINERO (arqueo de caja, cobranza) no la usan: suman sobre `payments`, que
 * solo tiene plata real.
 */
const SETTLED_STATUSES = ["pagado", "exonerado"];
// Para intercalar en SQL crudo: `status IN (${SETTLED_SQL})`.
const SETTLED_SQL = SETTLED_STATUSES.map(s => `'${s}'`).join(", ");
// Las que siguen en cuentas por cobrar.
const RECEIVABLE_STATUSES = ["borrador", "pendiente", "parcial"];

/**
 * Ventas cuya mercancía salió del inventario.
 *
 * El stock se descuenta al CREAR la venta (services/sales/createSale.js), sin mirar el estado:
 * desde ese momento la mercancía ya no está en el depósito, se haya cobrado o no. Por eso los
 * reportes de lo VENDIDO se cortan por esta lista y no por SETTLED_STATUSES —que es lo
 * COBRADO—: con el criterio viejo, una venta a crédito o una mesa abierta sacaba producto del
 * inventario sin aparecer en ningún reporte, y el faltante no se podía explicar contra nada.
 *
 * Quedan fuera los tres estados sin mercancía afuera:
 *  - 'anulado' y 'devuelto' reponen el stock (cancelSale.js, returnService.js).
 *  - 'pedido' nunca lo descontó (cancelSale.js: `stockWasTaken = sale.status !== 'pedido'`).
 *
 * 'borrador' y 'espera' —cuentas abiertas y ventas pausadas— SÍ entran: su producto ya salió,
 * aunque el documento todavía no esté cerrado.
 *
 * Los reportes de DINERO (arqueo, cobranza, canales de pago) no usan ninguna de las dos
 * listas: suman sobre `payments`, que solo tiene plata real.
 */
const DISPATCHED_STATUSES = ["pagado", "exonerado", "pendiente", "parcial", "borrador", "espera"];
const DISPATCHED_SQL = DISPATCHED_STATUSES.map(s => `'${s}'`).join(", ");

// De lo despachado, lo que todavía no se cobró. Es el complemento exacto de SETTLED dentro de
// DISPATCHED, así que facturado − cobrado = esto, sin huecos ni solapes.
const UNPAID_STATUSES = DISPATCHED_STATUSES.filter(s => !SETTLED_STATUSES.includes(s));
const UNPAID_SQL = UNPAID_STATUSES.map(s => `'${s}'`).join(", ");

/**
 * Estado que le corresponde a una factura según lo cobrado, lo acreditado por devoluciones y
 * lo exonerado.
 *
 * No decide sobre 'anulado', 'devuelto', 'espera' ni 'pedido': esos los fija otro flujo y
 * quien llama debe respetarlos.
 */
function resolveSaleStatus({ saleTotal, paid, returned = 0, hasInvoice = true, forgiven = 0 }) {
  const total = parseFloat(saleTotal) || 0;
  const cobrado = parseFloat(paid) || 0;
  const acreditado = parseFloat(returned) || 0;
  const perdonado = parseFloat(forgiven) || 0;
  // Lo que realmente queda por cobrar descuenta las devoluciones vivas.
  const porCobrar = Math.max(0, total - acreditado);

  if (porCobrar <= PAYMENT_TOLERANCE) return "pagado";
  // Lo perdonado salda igual que el dinero, pero deja constancia: mientras quede algo
  // exonerado en pie, la factura no se hace pasar por cobrada.
  if (cobrado + perdonado >= porCobrar - PAYMENT_TOLERANCE) {
    return perdonado > 0 ? "exonerado" : "pagado";
  }
  if (cobrado <= 0) return hasInvoice ? "pendiente" : "borrador";
  return "parcial";
}

module.exports = {
  PAYMENT_TOLERANCE,
  SETTLED_STATUSES,
  SETTLED_SQL,
  DISPATCHED_STATUSES,
  DISPATCHED_SQL,
  UNPAID_STATUSES,
  UNPAID_SQL,
  RECEIVABLE_STATUSES,
  resolveSaleStatus,
};
