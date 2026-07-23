const {
  Sale,
  SaleItem,
  Product,
  ProductStock,
  sequelize,
} = require("./shared");
const getOneSale = require("./getOneSale");

module.exports = async function updateSale(saleId, body) {
  const { items, discount_amount } = body;

  if (!items?.length) throw Object.assign(new Error("Debes incluir al menos un producto"), { status: 400 });

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, {
      include: [{ model: SaleItem }],
      transaction,
      lock: true,
    });

    if (!sale) throw Object.assign(new Error("Venta no encontrada"), { status: 404 });
    if (sale.status !== "borrador") {
      throw Object.assign(
        new Error("Solo se pueden editar ventas en borrador. Una vez asignado el correlativo el documento es inmutable."),
        { status: 400 }
      );
    }

    const warehouseId = sale.warehouse_id;

    // Restore stock for all existing items
    for (const item of sale.SaleItems) {
      const product = await Product.findByPk(item.product_id, { transaction });
      if (!product || product.is_service) continue;

      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id: warehouseId, product_id: item.product_id },
        transaction,
        lock: true,
      });
      if (stockEntry) {
        await stockEntry.increment("qty", { by: parseFloat(item.quantity), transaction });
        const totalStock = await ProductStock.sum("qty", {
          where: { product_id: item.product_id },
          transaction,
        });
        await product.update({ stock: totalStock || 0 }, { transaction });
      }
    }

    // Delete all existing items
    await SaleItem.destroy({ where: { sale_id: saleId }, transaction });

    // Create new items
    let total = 0;
    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);
      if (product.is_combo) throw new Error("No se puede editar una venta que contiene combos");

      const unitPrice = parseFloat(item.price ?? product.price);
      const qty = parseFloat(item.qty);
      if (qty <= 0) continue;

      if (!product.is_service) {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id: warehouseId, product_id: product.id },
          transaction,
          lock: true,
        });
        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (currentQty < qty) {
          throw new Error(
            `Stock insuficiente para "${product.name}". Disponible: ${currentQty}`
          );
        }
        await stockEntry.decrement("qty", { by: qty, transaction });
        const totalStock = await ProductStock.sum("qty", {
          where: { product_id: product.id },
          transaction,
        });
        await product.update({ stock: totalStock || 0 }, { transaction });
      }

      await SaleItem.create(
        {
          sale_id: saleId,
          product_id: product.id,
          name: product.name,
          price: unitPrice,
          quantity: qty,
          discount: 0,
        },
        { transaction }
      );

      total += unitPrice * qty;
    }

    const discAmt = parseFloat(discount_amount ?? sale.discount_amount) || 0;
    // 2 decimales: sale.total es el monto "oficial" de la factura en $.
    // La precisión completa vive en sale_items (price/discount/subtotal).
    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    await sale.update({ total, discount_amount: discAmt }, { transaction });

    await transaction.commit();

    return await getOneSale(saleId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
