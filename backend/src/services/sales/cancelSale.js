const { Sale, SaleItem, Product, ProductComboItem, ProductStock, sequelize } = require("./shared");

const { assertWarehouseAccess } = require("../../middleware/auth");

module.exports = async function cancelSale(id, req) {
  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(id, { transaction, lock: true });
    if (!sale) throw new Error("Venta no encontrada");
    // Anular devuelve inventario a una sucursal concreta.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    const items = await SaleItem.findAll({
      where: { sale_id: sale.id },
      transaction,
    });

    // Un pedido del catálogo que todavía no fue aceptado nunca descontó inventario:
    // "devolverlo" aquí regalaría existencias que jamás salieron.
    const stockWasTaken = sale.status !== 'pedido';

    for (const item of stockWasTaken ? items : []) {
      if (!item.product_id) continue;
      const product = await Product.findByPk(item.product_id, { transaction });

      if (product && product.is_service) {
        // no-op
      } else if (product && product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        for (const cItem of comboItems) {
          const qtyToRestore = item.quantity * parseFloat(cItem.quantity);
          const [stockEntry] = await ProductStock.findOrCreate({
            where: { warehouse_id: sale.warehouse_id, product_id: cItem.product_id },
            defaults: { qty: 0 },
            transaction,
            lock: true,
          });
          await stockEntry.increment("qty", { by: qtyToRestore, transaction });

          const totalStock = await ProductStock.sum("qty", {
            where: { product_id: cItem.product_id },
            transaction,
          });
          await Product.update({ stock: totalStock || 0 }, { where: { id: cItem.product_id }, transaction });
        }
      } else {
        const [stockEntry] = await ProductStock.findOrCreate({
          where: { warehouse_id: sale.warehouse_id, product_id: item.product_id },
          defaults: { qty: 0 },
          transaction,
          lock: true,
        });
        await stockEntry.increment("qty", { by: item.quantity, transaction });

        const totalStock = await ProductStock.sum("qty", {
          where: { product_id: item.product_id },
          transaction,
        });
        await Product.update({ stock: totalStock || 0 }, { where: { id: item.product_id }, transaction });
      }
    }

    const { Payment } = require("../../models");
    await Payment.destroy({ where: { sale_id: id }, transaction });

    // Una cuenta en espera nunca llegó a ser un documento: no consumió correlativo ni se
    // entregó nada. Dejarla como 'anulado' ensuciaría el historial de facturas con algo
    // que nunca existió, así que se borra de verdad (sale_items va en cascada).
    // El resto sí se anula en lugar de destruirse: ya son documentos con número emitido.
    if (sale.status === 'espera' || sale.status === 'pedido') {
      await sale.destroy({ transaction });
    } else {
      // Si el saldo se había exonerado, el perdón muere con la factura: anulada ya no debe
      // nada, y dejar el monto puesto lo seguiría contando como saldo perdonado del período.
      await sale.update({
        status: 'anulado',
        forgiven_amount: 0,
        forgiven_reason: null,
        forgiven_by: null,
        forgiven_at: null,
      }, { transaction });
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
