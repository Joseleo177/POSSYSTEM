const { Sale, SaleItem, Product, ProductComboItem, ProductStock, sequelize } = require("./shared");
const getOneSale = require("./getOneSale");

// Convierte un pedido del catálogo público (status 'pedido', sin efecto en inventario) en
// una cuenta en espera normal. Aquí sí se descuenta el stock: es el momento en que una
// persona del comercio acepta el pedido y la mercancía queda comprometida. A partir de
// este punto la venta es indistinguible de una abierta en caja — se recupera, se le
// agregan líneas y se cobra con el flujo de siempre.
module.exports = async function acceptWebOrder(saleId, { warehouse_id, employee_id }) {
  if (!warehouse_id) {
    throw Object.assign(new Error("Selecciona un almacén antes de aceptar el pedido"), { status: 400 });
  }

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });
    // Aceptar dos veces descontaría el inventario dos veces. El bloqueo de arriba serializa
    // los intentos simultáneos y esta comprobación descarta el segundo.
    if (sale.status !== "pedido") {
      throw Object.assign(new Error("Este pedido ya fue aceptado o cancelado"), { status: 400 });
    }

    const items = await SaleItem.findAll({ where: { sale_id: sale.id }, transaction });
    if (!items.length) throw Object.assign(new Error("El pedido no tiene líneas"), { status: 400 });

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) {
        throw Object.assign(new Error(`El producto "${item.name}" ya no existe`), { status: 400 });
      }
      if (product.is_service) continue;

      const qty = parseFloat(item.quantity);

      if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          const needed = qty * parseFloat(cItem.quantity);
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id, product_id: cItem.product_id }, transaction, lock: true,
          });
          if (parseFloat(stockEntry?.qty || 0) < needed) {
            throw Object.assign(
              new Error(`Stock insuficiente de "${ingredient?.name || item.name}" para el combo "${product.name}". Disponible: ${parseFloat(stockEntry?.qty || 0)}`),
              { status: 400 }
            );
          }
          await stockEntry.decrement("qty", { by: needed, transaction });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: cItem.product_id }, transaction });
          await Product.update({ stock: totalStock || 0 }, { where: { id: cItem.product_id }, transaction });
        }
      } else {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id, product_id: product.id }, transaction, lock: true,
        });
        if (parseFloat(stockEntry?.qty || 0) < qty) {
          throw Object.assign(
            new Error(`Stock insuficiente para "${product.name}". Disponible: ${parseFloat(stockEntry?.qty || 0)}`),
            { status: 400 }
          );
        }
        await stockEntry.decrement("qty", { by: qty, transaction });
        const totalStock = await ProductStock.sum("qty", { where: { product_id: product.id }, transaction });
        await product.update({ stock: totalStock || 0 }, { transaction });
      }
    }

    // Queda registrado quién lo aceptó: hasta ahora el pedido no tenía responsable.
    await sale.update({ status: "espera", warehouse_id, employee_id: employee_id || null }, { transaction });

    await transaction.commit();
    return await getOneSale(saleId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
