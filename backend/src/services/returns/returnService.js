const {
  Sale, SaleItem, Product, ProductStock, Employee,
  Return, ReturnItem, Serie, SerieRange, sequelize, Sequelize,
} = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { excludeAnnulledReturns, factorDevolucion, saleDebt, refreshSaleStatus, settleSurplus, defaultSurplusMode } = require("./shared");
const { consumoDeLinea } = require("../products/recipeStock");

async function createReturn({ saleId, items, reason, employee_id, refund, surplus_mode }, req) {
  if (!items?.length) { const e = new Error("Debes indicar al menos un producto a devolver"); e.status = 400; throw e; }

  // El reembolso puede salir de VARIAS cajas (parte en efectivo, resto por transferencia),
  // igual que el vuelto de un cobro. `refund.parts` es la forma nueva; `refund.journal_id`
  // suelto se acepta como un solo tramo por compatibilidad.
  const refundNormalizado = refund && refund.enabled !== false
    ? {
        ...refund,
        parts: (Array.isArray(refund.parts) && refund.parts.length)
          ? refund.parts
          : (refund.journal_id ? [{ journal_id: refund.journal_id, amount: refund.amount, reference: refund.reference }] : []),
      }
    : null;

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) { const e = new Error("Venta no encontrada"); e.status = 404; throw e; }
    if (sale.status === "anulado") { const e = new Error("La factura está anulada: no admite devoluciones"); e.status = 400; throw e; }
    // La devolución reingresa mercancía al almacén de la venta.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    const saleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    const itemsMap  = Object.fromEntries(saleItems.map(i => [i.id, i]));
    // Lo devuelto se lleva su parte del descuento de la venta (ver factorDevolucion).
    const factor = factorDevolucion(sale, saleItems);
    // Lo devuelto en una NC anulada vuelve a estar disponible para devolver.
    const soloVivas = await excludeAnnulledReturns(saleId, transaction);

    let returnTotal = 0;
    const returnLines = [];

    for (const { sale_item_id, qty } of items) {
      const si = itemsMap[sale_item_id];
      if (!si) { const e = new Error(`Ítem ${sale_item_id} no pertenece a esta venta`); e.status = 400; throw e; }

      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        const e = new Error(`Cantidad inválida para ${si.name}`); e.status = 400; throw e;
      }

      const alreadyReturned = await ReturnItem.sum('qty', { where: { sale_item_id, ...soloVivas }, transaction }) || 0;
      const availableToReturn = parseFloat(si.quantity) - parseFloat(alreadyReturned);

      if (parsedQty > availableToReturn) {
        const e = new Error(
          `Solo quedan ${availableToReturn} uds disponibles para devolver de "${si.name}" (ya se devolvieron ${alreadyReturned})`
        );
        e.status = 400; throw e;
      }

      // 6 decimales y no 2: el precio de la línea puede tener cinco (sale_items.price), y
      // redondear aquí devolvía menos dinero del que se cobró. Lo que se muestra al cajero sí
      // se redondea a dos, pero eso es presentación, no lo que se guarda.
      const subtotal = parseFloat(((si.price - si.discount) * parsedQty * factor).toFixed(6));
      returnTotal += subtotal;
      returnLines.push({ sale_item_id, product_id: si.product_id, name: si.name, price: si.price, qty: parsedQty, subtotal });
    }

    // La deuda se mide ANTES de crear la NC: una vez creada, ella misma ya la rebaja.
    const deuda = await saleDebt(sale, transaction);
    const appliedToDebt = parseFloat(Math.min(returnTotal, deuda).toFixed(6));

    // Consume NC series if configured for this company
    let nc_number = null;
    try {
      let ncSerie = null;
      if (sale.serie_id) {
        const facturaSerie = await Serie.findByPk(sale.serie_id, { transaction });
        if (facturaSerie && facturaSerie.nc_serie_id) {
          ncSerie = await Serie.findOne({ where: { id: facturaSerie.nc_serie_id, active: true }, transaction });
        }
      }

      if (!ncSerie) {
        // Fallback: la NC se numera con la primera serie NC de la sucursal
        ncSerie = await Serie.findOne({
          where: {
            type: 'nc',
            active: true,
            company_id: sale.company_id || null,
            ...(sale.warehouse_id ? { warehouse_id: sale.warehouse_id } : {}),
          },
          transaction,
        });
      }
      if (ncSerie) {
        const ncRange = await SerieRange.findOne({
          where: {
            serie_id: ncSerie.id,
            active: true,
            current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') },
          },
          order: [['start_number', 'ASC']],
          lock: true,
          transaction,
        });
        if (ncRange) {
          const num = ncRange.current_number;
          nc_number = `${ncSerie.prefix}-${String(num).padStart(ncSerie.padding, '0')}`;
          const next = num + 1;
          await ncRange.update(
            next > ncRange.end_number
              ? { current_number: next, active: false }
              : { current_number: next },
            { transaction }
          );
        }
      }
    } catch (e) {
      // Propagar errores si ocurren durante la consulta
      throw e;
    }

    if (!nc_number) {
      const e = new Error("No hay serie de Notas de Crédito vinculada o con correlativos disponibles para procesar esta devolución.");
      e.status = 400; throw e;
    }

    const returnRecord = await Return.create({
      sale_id:     saleId,
      employee_id: employee_id || null,
      reason:      reason || null,
      nc_number:   nc_number,
      total:       parseFloat(returnTotal.toFixed(6)),
      company_id:  sale.company_id || null,
    }, { transaction });

    for (const line of returnLines) {
      await ReturnItem.create({
        return_id:    returnRecord.id,
        sale_item_id: line.sale_item_id,
        product_id:   line.product_id,
        name:         line.name,
        price:        line.price,
        qty:          line.qty,
        subtotal:     line.subtotal,
      }, { transaction });

      if (line.product_id) {
        const product = await Product.findByPk(line.product_id, { transaction });
        // Vuelve lo que la línea vendida descontó (su foto), no la receta de hoy.
        const vendida = line.sale_item_id ? await SaleItem.findByPk(line.sale_item_id, { transaction }) : null;
        const consumo = await consumoDeLinea(vendida, product, sale.created_at, transaction);

        if (consumo) {
          for (const cItem of consumo) {
            const qtyToRestore = line.qty * parseFloat(cItem.quantity);
            const [stockEntry] = await ProductStock.findOrCreate({
              where:    { warehouse_id: sale.warehouse_id, product_id: cItem.product_id },
              defaults: { qty: 0 },
              transaction, lock: true,
            });
            await stockEntry.increment("qty", { by: qtyToRestore, transaction });
            const totalStock = await ProductStock.sum("qty", { where: { product_id: cItem.product_id }, transaction });
            await Product.update({ stock: totalStock || 0 }, { where: { id: cItem.product_id }, transaction });
          }
        } else if (product && !product.is_service) {
          const [stockEntry] = await ProductStock.findOrCreate({
            where:    { warehouse_id: sale.warehouse_id, product_id: line.product_id },
            defaults: { qty: 0 },
            transaction, lock: true,
          });
          await stockEntry.increment("qty", { by: line.qty, transaction });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: line.product_id }, transaction });
          await Product.update({ stock: totalStock || 0 }, { where: { id: line.product_id }, transaction });
        }
      }
    }

    // Check if all items are fully returned → mark sale as 'devuelto'
    const allSaleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    let fullyReturned  = true;
    for (const si of allSaleItems) {
      const totalRet = await ReturnItem.sum('qty', { where: { sale_item_id: si.id, ...soloVivas }, transaction }) || 0;
      if (parseFloat(totalRet) < parseFloat(si.quantity)) { fullyReturned = false; break; }
    }
    // Con la NC ya creada, una factura a crédito puede quedar saldada por ella.
    const saleStatus = await refreshSaleStatus(sale, { fullyReturned }, transaction);

    // Lo que no se llevó la deuda es dinero que el cliente ya pagó: el cajero elige si queda a
    // su favor, si se le reembolsa desde caja o si no se le devuelve (ver settleSurplus). El
    // saldo a favor queda atado a la sucursal que vendió —la misma que reingresó la mercancía
    // arriba— y solo se aplica en otra venta de esa sucursal (ver creditLedger.js).
    const surplus = parseFloat((returnTotal - appliedToDebt).toFixed(6));
    const settled = await settleSurplus({
      sale,
      surplus,
      mode:       surplus_mode || defaultSurplusMode({ refund: refundNormalizado, customerId: sale.customer_id }),
      refund:     refundNormalizado,
      ncNumber:   nc_number,
      returnId:   returnRecord.id,
      employeeId: employee_id,
    }, transaction);
    const refundExpenseIds = settled.expenseIds;
    const refundExpenseId = refundExpenseIds[0] || null;

    await transaction.commit();
    return {
      message: `Devolución registrada exitosamente. Total: ${returnTotal.toFixed(2)}`,
      data: {
        return_id: returnRecord.id, nc_number, total: returnTotal, items: returnLines,
        refund_expense_id: refundExpenseId, refund_expense_ids: refundExpenseIds,
        // Cómo se repartió la NC: lo que rebajó la deuda de la factura y lo que sobró.
        applied_to_debt: appliedToDebt,
        credited:        settled.credited,
        refunded:        settled.refunded,
        kept:            settled.kept,
        sale_status:     saleStatus,
      },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getSaleReturns(saleId) {
  const returns = await Return.findAll({
    where:   { sale_id: saleId },
    include: [
      { model: Employee,   attributes: ['full_name'] },
      { model: ReturnItem },
    ],
    order: [['created_at', 'DESC']],
  });

  const data = returns.map(r => {
    const item = r.toJSON();
    item.employee_name = item.Employee?.full_name || 'Desconocido';
    item.items         = item.ReturnItems;
    delete item.Employee;
    delete item.ReturnItems;
    return item;
  });

  return { data };
}

module.exports = { createReturn, getSaleReturns };
