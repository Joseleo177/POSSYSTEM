const {
  Sale, SaleItem, Product, ProductStock, Employee,
  Return, ReturnItem, Payment, ProductComboItem, Serie, SerieRange, sequelize, Sequelize,
} = require("../../models");

async function createReturn({ saleId, items, reason, employee_id }) {
  if (!items?.length) { const e = new Error("Debes indicar al menos un producto a devolver"); e.status = 400; throw e; }

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) throw new Error("Venta no encontrada");

    const saleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    const itemsMap  = Object.fromEntries(saleItems.map(i => [i.id, i]));

    let returnTotal = 0;
    const returnLines = [];

    for (const { sale_item_id, qty } of items) {
      const si = itemsMap[sale_item_id];
      if (!si) throw new Error(`Ítem ${sale_item_id} no pertenece a esta venta`);

      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0)
        throw new Error(`Cantidad inválida para ${si.name}`);

      const alreadyReturned = await ReturnItem.sum('qty', { where: { sale_item_id }, transaction }) || 0;
      const availableToReturn = parseFloat(si.quantity) - parseFloat(alreadyReturned);

      if (parsedQty > availableToReturn) {
        throw new Error(
          `Solo quedan ${availableToReturn} uds disponibles para devolver de "${si.name}" (ya se devolvieron ${alreadyReturned})`
        );
      }

      const subtotal = parseFloat(((si.price - si.discount) * parsedQty).toFixed(2));
      returnTotal += subtotal;
      returnLines.push({ sale_item_id, product_id: si.product_id, name: si.name, price: si.price, qty: parsedQty, subtotal });
    }

    // Consume NC series if configured for this company
    let nc_number = null;
    try {
      const ncSerie = await Serie.findOne({
        where: { type: 'nc', active: true, company_id: sale.company_id || null },
        transaction,
      });
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
    } catch { /* serie opcional — no interrumpe la devolución */ }

    const returnRecord = await Return.create({
      sale_id:     saleId,
      employee_id: employee_id || null,
      reason:      reason || null,
      nc_number:   nc_number,
      total:       parseFloat(returnTotal.toFixed(2)),
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

        if (product && !product.is_service && product.is_combo) {
          const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
          for (const cItem of comboItems) {
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
      const totalRet = await ReturnItem.sum('qty', { where: { sale_item_id: si.id }, transaction }) || 0;
      if (parseFloat(totalRet) < parseFloat(si.quantity)) { fullyReturned = false; break; }
    }
    if (fullyReturned) await sale.update({ status: 'devuelto' }, { transaction });

    // Auto-refund: negative payment up to what was actually paid
    const totalPaid = await Payment.sum('amount', { where: { sale_id: saleId }, transaction }) || 0;
    if (parseFloat(totalPaid) > 0) {
      const refundAmount = Math.min(parseFloat(returnTotal), parseFloat(totalPaid));
      await Payment.create({
        sale_id:            saleId,
        customer_id:        sale.customer_id,
        amount:             -refundAmount,
        currency_id:        sale.currency_id,
        exchange_rate:      sale.exchange_rate,
        payment_journal_id: sale.payment_journal_id,
        employee_id:        employee_id || null,
        reference_date:     new Date(),
        reference_number:   `DEV-${returnRecord.id}`,
        notes:              `Reembolso automático por devolución #${returnRecord.id}`,
      }, { transaction });
    }

    await transaction.commit();
    return {
      message: `Devolución registrada exitosamente. Total: ${returnTotal.toFixed(2)}`,
      data:    { return_id: returnRecord.id, nc_number, total: returnTotal, items: returnLines },
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
