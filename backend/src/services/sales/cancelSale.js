const { Sale, SaleItem, Product, ProductComboItem, ProductStock, sequelize } = require("./shared");

module.exports = async function cancelSale(id) {
  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(id, { transaction, lock: true });
    if (!sale) throw new Error("Venta no encontrada");

    const items = await SaleItem.findAll({
      where: { sale_id: sale.id },
      transaction,
    });

    for (const item of items) {
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

    await sale.destroy({ transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
