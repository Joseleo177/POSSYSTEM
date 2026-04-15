const {
  Sale, SaleItem, Product, ProductStock, Employee, Customer, Currency, Warehouse, ProductComboItem,
  Return, ReturnItem, Payment, Sequelize, sequelize,
} = require("../models");

// POST /api/sales/:id/return
const createReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const saleId = parseInt(req.params.id);
    const { items, reason } = req.body; // items: [{ sale_item_id, qty }]

    if (!items?.length) throw new Error("Debes indicar al menos un producto a devolver");

    // 1. Cargar la venta base
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) throw new Error("Venta no encontrada");

    // 2. Cargar los ítems originales
    const saleItems = await SaleItem.findAll({
      where: { sale_id: saleId },
      transaction,
    });

    const itemsMap = Object.fromEntries(saleItems.map(i => [i.id, i]));

    // 3. Validar cantidades devueltas
    let returnTotal = 0;
    const returnLines = [];

    for (const { sale_item_id, qty } of items) {
      const si = itemsMap[sale_item_id];
      if (!si) throw new Error(`Ítem ${sale_item_id} no pertenece a esta venta`);

      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0)
        throw new Error(`Cantidad inválida para ${si.name}`);
      
      // 3.1 Validar contra devoluciones previas
      const alreadyReturned = await ReturnItem.sum('qty', {
        where: { sale_item_id },
        transaction
      }) || 0;

      const availableToReturn = parseFloat(si.quantity) - parseFloat(alreadyReturned);
      
      if (parsedQty > availableToReturn) {
        throw new Error(`Solo quedan ${availableToReturn} uds disponibles para devolver de "${si.name}" (ya se devolvieron ${alreadyReturned})`);
      }

      const subtotal = parseFloat(((si.price - si.discount) * parsedQty).toFixed(2));
      returnTotal += subtotal;

      returnLines.push({
        sale_item_id,
        product_id: si.product_id,
        name:       si.name,
        price:      si.price,
        qty:        parsedQty,
        subtotal,
      });
    }

    // 4. Crear el encabezado de devolución
    const returnRecord = await Return.create({
      sale_id:     saleId,
      employee_id: req.employee?.id || null,
      reason:      reason || null,
      total:       parseFloat(returnTotal.toFixed(2)),
    }, { transaction });

    // 5. Crear líneas + restaurar stock
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
        
        if (product && product.is_service) {
          // No se restaura stock para servicios
        } else if (product && product.is_combo) {
          const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
          for (const cItem of comboItems) {
            const qtyToRestore = line.qty * parseFloat(cItem.quantity);
            const [stockEntry] = await ProductStock.findOrCreate({
              where:    { warehouse_id: sale.warehouse_id, product_id: cItem.product_id },
              defaults: { qty: 0 },
              transaction,
              lock: true,
            });
            await stockEntry.increment("qty", { by: qtyToRestore, transaction });

            const totalStock = await ProductStock.sum("qty", {
              where: { product_id: cItem.product_id },
              transaction,
            });
            await Product.update(
              { stock: totalStock || 0 },
              { where: { id: cItem.product_id }, transaction }
            );
          }
        } else if (product) {
          // Restaurar stock en el almacén de la venta directamente
          const [stockEntry] = await ProductStock.findOrCreate({
            where:    { warehouse_id: sale.warehouse_id, product_id: line.product_id },
            defaults: { qty: 0 },
            transaction,
            lock: true,
          });
          await stockEntry.increment("qty", { by: line.qty, transaction });

          // Sincronizar stock total del producto
          const totalStock = await ProductStock.sum("qty", {
            where: { product_id: line.product_id },
            transaction,
          });
          await Product.update(
            { stock: totalStock || 0 },
            { where: { id: line.product_id }, transaction }
          );
        }
      }
    }

    // 6. Actualizar estado de la venta si es necesario
    const allSaleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    let fullyReturned = true;
    for (const si of allSaleItems) {
      const totalRet = await ReturnItem.sum('qty', { where: { sale_item_id: si.id }, transaction }) || 0;
      if (parseFloat(totalRet) < parseFloat(si.quantity)) {
        fullyReturned = false;
        break;
      }
    }

    if (fullyReturned) {
      await sale.update({ status: 'devuelto' }, { transaction });
    }

    // 7. Generar Reembolso Automático (Pago Negativo)
    // Buscamos cuánto se ha pagado en esta factura
    const totalPaid = await Payment.sum('amount', { where: { sale_id: saleId }, transaction }) || 0;
    
    // Si hay plata cobrada, registramos un reembolso por el total de la devolución (o lo que haya disponible de saldo pagado)
    if (parseFloat(totalPaid) > 0) {
      const refundAmount = Math.min(parseFloat(returnTotal), parseFloat(totalPaid));
      
      await Payment.create({
        sale_id:            saleId,
        customer_id:        sale.customer_id,
        amount:             -refundAmount, // Negativo para restar del diario
        currency_id:        sale.currency_id,
        exchange_rate:      sale.exchange_rate,
        payment_journal_id: sale.payment_journal_id,
        employee_id:        req.employee?.id || null,
        reference_date:     new Date(),
        reference_number:   `DEV-${returnRecord.id}`,
        notes:              `Reembolso automático por devolución #${returnRecord.id}`
      }, { transaction });
    }

    await transaction.commit();

    res.status(201).json({
      ok: true,
      message: `Devolución registrada exitosamente. Total: ${returnTotal.toFixed(2)}`,
      data: { return_id: returnRecord.id, total: returnTotal, items: returnLines },
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    const status = /no encontrada|inválida|más de/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// GET /api/sales/:id/returns
const getSaleReturns = async (req, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const returns = await Return.findAll({
      where: { sale_id: saleId },
      include: [
        { model: Employee, attributes: ['full_name'] },
        { model: ReturnItem }
      ],
      order: [['created_at', 'DESC']]
    });

    const data = returns.map(r => {
      const item = r.toJSON();
      item.employee_name = item.Employee?.full_name || 'Desconocido';
      item.items = item.ReturnItems;
      delete item.Employee;
      delete item.ReturnItems;
      return item;
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener devoluciones" });
  }
};

module.exports = { createReturn, getSaleReturns };
