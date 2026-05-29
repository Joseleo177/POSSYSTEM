const {
  Sale, SaleItem, Product, ProductStock, Employee, Customer,
  Return, ReturnItem, Payment, ProductComboItem, Serie, SerieRange, sequelize, Sequelize,
} = require("../../models");

module.exports = async function createExchange({ saleId, returnItems, replacementItems, reason, employeeId }) {
  if (!returnItems?.length)      { const e = new Error("Debes indicar al menos un producto a devolver"); e.status = 400; throw e; }
  if (!replacementItems?.length) { const e = new Error("Debes indicar al menos un producto de reemplazo"); e.status = 400; throw e; }

  const t = await sequelize.transaction();
  try {
    /* ── 1. Validar venta original ── */
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) { const e = new Error("Venta no encontrada"); e.status = 404; throw e; }

    const saleItemsDb = await SaleItem.findAll({ where: { sale_id: saleId }, transaction: t });
    const itemsMap = Object.fromEntries(saleItemsDb.map(i => [i.id, i]));

    /* ── 2. Calcular total de devolución y validar cantidades ── */
    let returnTotal = 0;
    const returnLines = [];

    for (const { sale_item_id, qty } of returnItems) {
      const si = itemsMap[sale_item_id];
      if (!si) { const e = new Error(`Ítem ${sale_item_id} no pertenece a esta venta`); e.status = 400; throw e; }
      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) { const e = new Error(`Cantidad inválida para ${si.name}`); e.status = 400; throw e; }
      const alreadyReturned   = parseFloat(await ReturnItem.sum('qty', { where: { sale_item_id }, transaction: t }) || 0);
      const availableToReturn = parseFloat(si.quantity) - alreadyReturned;
      if (parsedQty > availableToReturn) {
        const e = new Error(`Solo quedan ${availableToReturn} uds disponibles para devolver de "${si.name}"`);
        e.status = 400; throw e;
      }
      const subtotal = parseFloat(((si.price - (si.discount || 0)) * parsedQty).toFixed(6));
      returnTotal += subtotal;
      returnLines.push({ sale_item_id, product_id: si.product_id, name: si.name, price: si.price, qty: parsedQty, subtotal });
    }
    returnTotal = parseFloat(returnTotal.toFixed(6));

    /* ── 3. Crear registro de devolución + NC ── */
    let nc_number = null;
    try {
      const ncSerie = await Serie.findOne({ where: { type: 'nc', active: true, company_id: sale.company_id || null }, transaction: t });
      if (ncSerie) {
        const ncRange = await SerieRange.findOne({
          where: { serie_id: ncSerie.id, active: true, current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') } },
          order: [['start_number', 'ASC']], lock: true, transaction: t,
        });
        if (ncRange) {
          nc_number = `${ncSerie.prefix}-${String(ncRange.current_number).padStart(ncSerie.padding, '0')}`;
          const next = ncRange.current_number + 1;
          await ncRange.update(next > ncRange.end_number ? { current_number: next, active: false } : { current_number: next }, { transaction: t });
        }
      }
    } catch { /* serie opcional */ }

    const returnRecord = await Return.create({
      sale_id: saleId, employee_id: employeeId || null,
      reason: reason || 'Cambio de producto', nc_number,
      total: returnTotal, company_id: sale.company_id || null,
    }, { transaction: t });

    for (const line of returnLines) {
      await ReturnItem.create({
        return_id: returnRecord.id, sale_item_id: line.sale_item_id,
        product_id: line.product_id, name: line.name,
        price: line.price, qty: line.qty, subtotal: line.subtotal,
      }, { transaction: t });

      /* Restaurar stock del producto devuelto */
      if (line.product_id) {
        const product = await Product.findByPk(line.product_id, { transaction: t });
        if (product && !product.is_service && product.is_combo) {
          const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction: t });
          for (const ci of comboItems) {
            const [stockEntry] = await ProductStock.findOrCreate({ where: { warehouse_id: sale.warehouse_id, product_id: ci.product_id }, defaults: { qty: 0 }, transaction: t, lock: true });
            await stockEntry.increment("qty", { by: line.qty * parseFloat(ci.quantity), transaction: t });
            const total = await ProductStock.sum("qty", { where: { product_id: ci.product_id }, transaction: t });
            await Product.update({ stock: total || 0 }, { where: { id: ci.product_id }, transaction: t });
          }
        } else if (product && !product.is_service) {
          const [stockEntry] = await ProductStock.findOrCreate({ where: { warehouse_id: sale.warehouse_id, product_id: line.product_id }, defaults: { qty: 0 }, transaction: t, lock: true });
          await stockEntry.increment("qty", { by: line.qty, transaction: t });
          const total = await ProductStock.sum("qty", { where: { product_id: line.product_id }, transaction: t });
          await Product.update({ stock: total || 0 }, { where: { id: line.product_id }, transaction: t });
        }
      }
    }

    /* Marcar venta original como devuelta si corresponde */
    let fullyReturned = true;
    for (const si of saleItemsDb) {
      const totalRet = parseFloat(await ReturnItem.sum('qty', { where: { sale_item_id: si.id }, transaction: t }) || 0);
      if (totalRet < parseFloat(si.quantity)) { fullyReturned = false; break; }
    }
    if (fullyReturned) await sale.update({ status: 'devuelto' }, { transaction: t });

    /* ── 4. Calcular total de reemplazo y validar stock ── */
    let replacementTotal = 0;
    const replacementLines = [];

    for (const item of replacementItems) {
      const { product_id, name, qty, price } = item;
      const parsedQty   = parseFloat(qty);
      const parsedPrice = parseFloat(price);
      if (!product_id || isNaN(parsedQty) || parsedQty <= 0 || isNaN(parsedPrice) || parsedPrice < 0) {
        const e = new Error(`Datos inválidos para producto de reemplazo: ${name}`); e.status = 400; throw e;
      }
      const product = await Product.findByPk(product_id, { transaction: t });
      if (!product) { const e = new Error(`Producto ${name} no encontrado`); e.status = 404; throw e; }
      if (!product.is_service && parseFloat(product.stock || 0) < parsedQty) {
        const e = new Error(`Stock insuficiente para "${product.name}" (disponible: ${product.stock})`); e.status = 400; throw e;
      }
      const subtotal = parseFloat((parsedPrice * parsedQty).toFixed(6));
      replacementTotal += subtotal;
      replacementLines.push({ product_id, name: product.name, qty: parsedQty, price: parsedPrice, subtotal, is_service: product.is_service });
    }
    replacementTotal = parseFloat(replacementTotal.toFixed(6));

    /* ── 5. Asignar correlativo a la venta de reemplazo ── */
    let exchangeInvoiceNumber = null;
    let exchangeSerieId       = sale.serie_id || null;
    let exchangeCorrelative   = null;
    let exchangeRangeId       = null;
    if (exchangeSerieId) {
      try {
        const exSerie = await Serie.findByPk(exchangeSerieId, { transaction: t });
        if (exSerie && exSerie.active) {
          const exRange = await SerieRange.findOne({
            where: { serie_id: exchangeSerieId, active: true, current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') } },
            order: [['start_number', 'ASC']], lock: true, transaction: t,
          });
          if (exRange) {
            exchangeCorrelative   = exRange.current_number;
            exchangeInvoiceNumber = `${exSerie.prefix}-${String(exchangeCorrelative).padStart(exSerie.padding, '0')}`;
            exchangeRangeId       = exRange.id;
            const nextNum = exchangeCorrelative + 1;
            await exRange.update(
              nextNum > exRange.end_number ? { current_number: nextNum, active: false } : { current_number: nextNum },
              { transaction: t }
            );
          }
        }
      } catch (e) { console.error('[exchangeService] serie error', e.message); }
    }

    /* ── 5b. Crear nueva venta de reemplazo ── */
    const exchangeSale = await Sale.create({
      customer_id:        sale.customer_id,
      employee_id:        employeeId || null,
      company_id:         sale.company_id || null,
      warehouse_id:       sale.warehouse_id,
      currency_id:        sale.currency_id,
      exchange_rate:      sale.exchange_rate,
      payment_journal_id: sale.payment_journal_id,
      serie_id:           exchangeSerieId,
      invoice_number:     exchangeInvoiceNumber,
      correlative_number: exchangeCorrelative,
      serie_range_id:     exchangeRangeId,
      total:              replacementTotal,
      paid:               0,
      change:             0,
      status:             'pendiente',
      notes:              `Cambio de Factura ${sale.invoice_number || '#' + saleId}`,
    }, { transaction: t });

    for (const line of replacementLines) {
      await SaleItem.create({
        sale_id: exchangeSale.id, product_id: line.product_id,
        name: line.name, price: line.price, quantity: line.qty,
        discount: 0,
      }, { transaction: t });

      /* Decrementar stock del producto de reemplazo */
      if (!line.is_service) {
        const [stockEntry] = await ProductStock.findOrCreate({ where: { warehouse_id: sale.warehouse_id, product_id: line.product_id }, defaults: { qty: 0 }, transaction: t, lock: true });
        await stockEntry.decrement("qty", { by: line.qty, transaction: t });
        const total = await ProductStock.sum("qty", { where: { product_id: line.product_id }, transaction: t });
        await Product.update({ stock: Math.max(0, total || 0) }, { where: { id: line.product_id }, transaction: t });
      }
    }

    /* ── 6. Aplicar crédito de devolución a la nueva venta ── */
    const creditToApply = parseFloat(Math.min(returnTotal, replacementTotal).toFixed(6));
    if (creditToApply > 0 && sale.customer_id) {
      await Payment.create({
        sale_id:            exchangeSale.id,
        customer_id:        sale.customer_id,
        amount:             creditToApply,
        currency_id:        sale.currency_id || null,
        exchange_rate:      sale.exchange_rate || 1,
        payment_journal_id: null,
        employee_id:        employeeId || null,
        reference_date:     new Date(),
        notes:              `Crédito aplicado por cambio — NC ${nc_number || returnRecord.id}`,
      }, { transaction: t });
    }

    /* Saldo sobrante va al crédito del cliente */
    const creditRemainder = parseFloat((returnTotal - creditToApply).toFixed(6));
    if (creditRemainder > 0.001 && sale.customer_id) {
      await Customer.increment({ credit_balance: creditRemainder }, { where: { id: sale.customer_id }, transaction: t });
    }

    const remainingToPay = parseFloat((replacementTotal - creditToApply).toFixed(6));
    const newStatus = remainingToPay <= 0.001 ? 'pagado' : 'pendiente';
    await exchangeSale.update({ status: newStatus }, { transaction: t });

    await t.commit();
    return {
      return_id:           returnRecord.id,
      nc_number,
      new_sale_id:         exchangeSale.id,
      new_invoice_number:  exchangeInvoiceNumber,
      return_total:        returnTotal,
      replacement_total:   replacementTotal,
      credit_applied:      creditToApply,
      credit_remainder:    creditRemainder,
      remaining_to_pay:    remainingToPay > 0.001 ? remainingToPay : 0,
      new_sale_status:     newStatus,
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
