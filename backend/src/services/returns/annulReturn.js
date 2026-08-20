const {
  Sale, SaleItem, Product, ProductStock, Customer,
  Return, ReturnItem, Payment, ProductComboItem, sequelize, Sequelize,
} = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");

const Op = Sequelize.Op;
const err = (message, status) => Object.assign(new Error(message), { status, isOperational: true });
const round2 = (n) => parseFloat(parseFloat(n || 0).toFixed(2));

/**
 * Anula una nota de crédito y deshace todo lo que hizo.
 *
 * La NC no se borra: el correlativo ya se emitió y quemarlo es lo mismo que se hace con las
 * facturas anuladas. Queda con status 'anulado' y firmada, y a partir de ahí ningún cálculo
 * la toma en cuenta (ver los filtros por status en returnService, exchangeService,
 * getAllSales, removePayment y los reportes).
 *
 * Lo que revierte, en una sola transacción:
 *   1. El inventario que reingresó al devolver (ingredientes incluidos si era un combo).
 *   2. El saldo a favor que ganó el cliente.
 *   3. El estado de la factura original, que vuelve a calcularse contra sus pagos.
 *
 * Dos casos se rechazan en vez de "arreglarse a medias", porque cualquier reversión
 * automática dejaría la contabilidad peor de lo que estaba:
 *
 *   · La NC nació de un CAMBIO. Ahí hay una factura de reemplazo viva que se pagó con este
 *     crédito; deshacer solo la devolución dejaría esa factura cobrada con dinero que ya no
 *     existe. Primero se anula la factura de reemplazo.
 *   · El cliente YA USÓ el crédito (lo aplicó a otra factura o se lo reembolsaron desde su
 *     ficha). Restarlo igual dejaría el saldo en negativo, que el resto del sistema lee como
 *     deuda. El reembolso en efectivo se registra como egreso "Devolución de Crédito" contra
 *     el cliente, sin referencia a la NC, así que tampoco hay un egreso que anular en
 *     cadena: hay que revertir ese movimiento primero, a mano y a la vista.
 */
module.exports = async function annulReturn(returnId, { employeeId }, req) {
  const t = await sequelize.transaction();
  try {
    const ret = await Return.findByPk(returnId, { transaction: t, lock: true });
    if (!ret) throw err("Nota de crédito no encontrada", 404);
    if (ret.status === "anulado") throw err("Esta nota de crédito ya está anulada", 400);

    const sale = await Sale.findByPk(ret.sale_id, { transaction: t, lock: true });
    if (!sale) throw err("La factura de esta nota de crédito no existe", 404);
    // Anular reingresa —en realidad saca— mercancía de un almacén concreto.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    const etiqueta = ret.nc_number || `NC-${ret.id}`;

    /* ── Guarda 1: la NC viene de un cambio ── */
    // El cambio deja el crédito aplicado como pago de la venta de reemplazo, con la NC
    // escrita en la nota. Es el único rastro que las enlaza.
    const pagoDeCambio = await Payment.findOne({
      where: { notes: `Crédito aplicado por cambio — NC ${ret.nc_number || ret.id}` },
      transaction: t,
    });
    if (pagoDeCambio) {
      const reemplazo = await Sale.findByPk(pagoDeCambio.sale_id, { transaction: t });
      const ref = reemplazo?.invoice_number || `#${pagoDeCambio.sale_id}`;
      throw err(
        `${etiqueta} pertenece a un cambio de producto. Anula primero la factura de reemplazo ${ref}, ` +
        `que se pagó con este crédito.`,
        400
      );
    }

    /* ── Guarda 2: el crédito ya se consumió ── */
    const acreditado = round2(ret.total);
    let customer = null;
    if (sale.customer_id) {
      customer = await Customer.findByPk(sale.customer_id, { transaction: t, lock: true });
      const disponible = round2(customer?.credit_balance);
      if (customer && disponible + 0.01 < acreditado) {
        throw err(
          `No se puede anular ${etiqueta}: de los ${acreditado.toFixed(2)} acreditados a ` +
          `${customer.name}, solo quedan ${disponible.toFixed(2)} disponibles. El resto ya se aplicó a ` +
          `otra factura o se reembolsó. Reversa ese movimiento antes de anular la nota.`,
          400
        );
      }
    }

    const lines = await ReturnItem.findAll({ where: { return_id: ret.id }, transaction: t });

    /* ── Guarda 3: el inventario ya salió otra vez ── */
    // Anular significa que esa mercancía nunca volvió, así que hay que sacarla del almacén.
    // Si ya se vendió, descontarla dejaría existencias negativas: eso no es revertir, es
    // romper el inventario en silencio.
    const aDescontar = new Map(); // product_id -> qty
    for (const line of lines) {
      if (!line.product_id) continue;
      const product = await Product.findByPk(line.product_id, { transaction: t });
      if (!product || product.is_service) continue;
      if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction: t });
        for (const ci of comboItems) {
          const need = parseFloat(line.qty) * parseFloat(ci.quantity);
          aDescontar.set(ci.product_id, (aDescontar.get(ci.product_id) || 0) + need);
        }
      } else {
        aDescontar.set(line.product_id, (aDescontar.get(line.product_id) || 0) + parseFloat(line.qty));
      }
    }

    for (const [productId, qty] of aDescontar) {
      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id: sale.warehouse_id, product_id: productId },
        transaction: t, lock: true,
      });
      const disponible = parseFloat(stockEntry?.qty || 0);
      if (disponible + 0.0001 < qty) {
        const prod = await Product.findByPk(productId, { transaction: t });
        throw err(
          `No se puede anular ${etiqueta}: hay que sacar ${qty} de "${prod?.name || productId}" del almacén y ` +
          `solo quedan ${disponible}. Esa mercancía ya volvió a salir; ajusta el inventario antes de anular.`,
          400
        );
      }
    }

    /* ── 1. Marcar la NC como anulada ── */
    await ret.update(
      { status: "anulado", annulled_at: new Date(), annulled_by: employeeId || null },
      { transaction: t }
    );

    /* ── 2. Revertir el inventario ── */
    for (const [productId, qty] of aDescontar) {
      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id: sale.warehouse_id, product_id: productId },
        transaction: t, lock: true,
      });
      await stockEntry.decrement("qty", { by: qty, transaction: t });
      const totalStock = await ProductStock.sum("qty", { where: { product_id: productId }, transaction: t });
      await Product.update({ stock: Math.max(0, totalStock || 0) }, { where: { id: productId }, transaction: t });
    }

    /* ── 3. Revertir el saldo a favor ── */
    if (customer && acreditado > 0) {
      await Customer.decrement({ credit_balance: acreditado }, { where: { id: customer.id }, transaction: t });
    }

    /* ── 4. Devolver la factura a su estado real ── */
    // Misma fórmula que al quitar un pago (ver removePayment): lo que se debe es el total
    // menos lo ya acreditado por las devoluciones que siguen vivas —esta ya no cuenta— y el
    // estado sale de compararlo con lo cobrado.
    const saleTotal = parseFloat(sale.total);
    const pagado = parseFloat(await Payment.sum("amount", { where: { sale_id: sale.id }, transaction: t }) || 0);
    const devuelto = parseFloat(await Return.sum("total", {
      where: { sale_id: sale.id, status: { [Op.ne]: "anulado" } },
      transaction: t,
    }) || 0);
    const porCobrar = Math.max(0, saleTotal - devuelto);

    let nuevoEstado = sale.status;
    // Una factura anulada lo está por su propio flujo: anular una NC no la revive.
    if (sale.status !== "anulado") {
      if (porCobrar <= 0.01) nuevoEstado = "pagado";
      else if (pagado <= 0) nuevoEstado = sale.invoice_number ? "pendiente" : "borrador";
      else if (pagado >= porCobrar - 0.01) nuevoEstado = "pagado";
      else nuevoEstado = "parcial";
      await sale.update({ status: nuevoEstado }, { transaction: t });
    }

    await t.commit();
    return {
      message: `${etiqueta} anulada. Se revirtió el inventario y el saldo a favor del cliente.`,
      data: {
        return_id: ret.id,
        nc_number: ret.nc_number,
        sale_id: sale.id,
        sale_status: nuevoEstado,
        credit_reverted: acreditado,
        products_reverted: aDescontar.size,
      },
    };
  } catch (e) {
    await t.rollback();
    throw e;
  }
};
