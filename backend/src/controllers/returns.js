const {
  Sale, SaleItem, Product, ProductStock, Employee, Customer, Currency, Warehouse, ProductComboItem,
  Sequelize, sequelize,
} = require("../models");

// POST /api/sales/:id/return
const createReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const saleId  = parseInt(req.params.id);
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
      if (parsedQty > si.quantity)
        throw new Error(`No puedes devolver más de ${si.quantity} uds de "${si.name}"`);

      const subtotal = parseFloat((si.price * parsedQty).toFixed(2));
      returnTotal += subtotal;

      returnLines.push({
        product_id: si.product_id,
        name:       si.name,
        price:      si.price,
        qty:        parsedQty,
        subtotal,
      });
    }

    // 4. Crear el encabezado de devolución
    const ret = await sequelize.query(
      `INSERT INTO returns (sale_id, employee_id, reason, total)
       VALUES (:saleId, :empId, :reason, :total)
       RETURNING id`,
      {
        replacements: {
          saleId,
          empId:  req.employee?.id || null,
          reason: reason || null,
          total:  parseFloat(returnTotal.toFixed(2)),
        },
        type: Sequelize.QueryTypes.INSERT,
        transaction,
      }
    );
    const returnId = ret[0][0].id;

    // 5. Crear líneas + restaurar stock
    for (const line of returnLines) {
      // Insertar línea
      await sequelize.query(
        `INSERT INTO return_items (return_id, product_id, name, price, qty, subtotal)
         VALUES (:returnId, :productId, :name, :price, :qty, :subtotal)`,
        {
          replacements: { returnId, ...line },
          type: Sequelize.QueryTypes.INSERT,
          transaction,
        }
      );

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
        } else {
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

    await transaction.commit();

    res.status(201).json({
      ok: true,
      message: `Devolución registrada. Total devuelto: ${returnTotal.toFixed(2)}`,
      data: { return_id: returnId, total: returnTotal, items: returnLines },
    });
  } catch (err) {
    await transaction.rollback();
    const status = /no encontrada|inválida|más de/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// GET /api/sales/:id/returns
const getSaleReturns = async (req, res) => {
  try {
    const returns = await sequelize.query(
      `SELECT r.id, r.sale_id, r.reason, r.total, r.created_at,
              e.full_name AS employee_name,
              json_agg(json_build_object(
                'id', ri.id, 'name', ri.name, 'price', ri.price,
                'qty', ri.qty, 'subtotal', ri.subtotal
              )) AS items
       FROM returns r
       LEFT JOIN employees e ON e.id = r.employee_id
       LEFT JOIN return_items ri ON ri.return_id = r.id
       WHERE r.sale_id = :saleId
       GROUP BY r.id, e.full_name
       ORDER BY r.created_at DESC`,
      {
        replacements: { saleId: parseInt(req.params.id) },
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    res.json({ ok: true, data: returns });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { createReturn, getSaleReturns };
