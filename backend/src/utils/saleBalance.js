/**
 * Criterio único para decidir si una factura está saldada.
 *
 * El sistema lleva dos pistas de redondeo a propósito: `sales.total` es la suma de los
 * precios ya redondeados a 2 decimales por línea, mientras que el cobro en bolívares trabaja
 * con los subtotales precisos (5 decimales). En una venta de 3 unidades a 4.06569 eso da
 * 12.21 contra 12.197053: el cliente pagó todo, pero los dos números no son iguales.
 *
 * Por eso la comparación admite como margen ese desfase y nada más: la diferencia entre el
 * total oficial y la suma precisa de SU factura (`roundingSlack`), más medio céntimo para que
 * lo que redondea al total cuente como el total. Con el margen fijo de diez céntimos que hubo
 * antes, a tasas cercanas a 850 Bs/$ una factura se cerraba debiendo hasta Bs.85 (14-10-2026),
 * y con un céntimo justo una factura pagada completa quedaba 'parcial' debiendo 0.0129.
 *
 * Vive aparte para que las rutas que tocan el estado —cobrar, cobro conjunto, quitar un pago,
 * exonerar y anular una nota de crédito— no se desalineen otra vez.
 */
// Umbral general de "un céntimo" en moneda base: sobrantes, vueltos y redondeos de pantalla.
const PAYMENT_TOLERANCE = 0.01;
// Lo que se le perdona a un cobro para dar la factura por saldada, aparte del desfase propio de
// cada factura: medio céntimo, es decir, solo lo que ya redondea al total.
const SETTLE_EPSILON = 0.005;

/**
 * Desfase de redondeo de una factura: cuánto pasa `sales.total` (precios redondeados por
 * línea) de la suma precisa de sus líneas, que es lo que se cobra en bolívares. Si el
 * redondeo fue hacia abajo no hay nada que perdonar.
 */
function roundingSlack({ saleTotal, linesPrecise, discount = 0, serviceCharge = 0 }) {
  const total = parseFloat(saleTotal) || 0;
  const precise = (parseFloat(linesPrecise) || 0) - (parseFloat(discount) || 0) + (parseFloat(serviceCharge) || 0);
  return Math.max(0, total - Math.max(0, precise));
}

// Margen con que se da por saldada una factura concreta, en moneda base.
function settleTolerance(args) {
  return SETTLE_EPSILON + roundingSlack(args);
}

// Lo mismo, leyendo las líneas de la venta. `sale` es la fila de `sales`.
async function saleSettleTolerance(sale, transaction) {
  // Perezoso: los modelos cargan utilidades y esta no debe depender de ellos al importarse.
  const { SaleItem } = require("../models");
  const linesPrecise = await SaleItem.sum("subtotal", { where: { sale_id: sale.id }, transaction });
  return settleTolerance({
    saleTotal: sale.total,
    linesPrecise,
    discount: sale.discount_amount,
    serviceCharge: sale.service_charge,
  });
}

// La misma cuenta en SQL, para la venta con alias `a`.
const settleToleranceSql = (a) => `(${SETTLE_EPSILON} + GREATEST(0, ${a}.total - GREATEST(0,
  (SELECT COALESCE(SUM(si.subtotal), 0) FROM sale_items si WHERE si.sale_id = ${a}.id)
  - COALESCE(${a}.discount_amount, 0) + COALESCE(${a}.service_charge, 0))))`;

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
 *
 * `tolerance` es el de la factura (saleSettleTolerance); sin él no se perdona más que el medio
 * céntimo.
 */
function resolveSaleStatus({ saleTotal, paid, returned = 0, hasInvoice = true, forgiven = 0, tolerance = SETTLE_EPSILON }) {
  const total = parseFloat(saleTotal) || 0;
  const cobrado = parseFloat(paid) || 0;
  const acreditado = parseFloat(returned) || 0;
  const perdonado = parseFloat(forgiven) || 0;
  // Lo que realmente queda por cobrar descuenta las devoluciones vivas.
  const porCobrar = Math.max(0, total - acreditado);

  if (porCobrar <= tolerance) return "pagado";
  // Lo perdonado salda igual que el dinero, pero deja constancia: mientras quede algo
  // exonerado en pie, la factura no se hace pasar por cobrada.
  if (cobrado + perdonado >= porCobrar - tolerance) {
    return perdonado > 0 ? "exonerado" : "pagado";
  }
  if (cobrado <= 0) return hasInvoice ? "pendiente" : "borrador";
  return "parcial";
}

module.exports = {
  PAYMENT_TOLERANCE,
  SETTLE_EPSILON,
  roundingSlack,
  settleTolerance,
  saleSettleTolerance,
  settleToleranceSql,
  SETTLED_STATUSES,
  SETTLED_SQL,
  DISPATCHED_STATUSES,
  DISPATCHED_SQL,
  UNPAID_STATUSES,
  UNPAID_SQL,
  RECEIVABLE_STATUSES,
  resolveSaleStatus,
};
