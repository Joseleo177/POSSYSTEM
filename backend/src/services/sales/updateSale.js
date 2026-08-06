const {
  Sale,
  SaleItem,
  Product,
  ProductComboItem,
  ProductStock,
  sequelize,
} = require("./shared");
const getOneSale = require("./getOneSale");

const bad = (msg, status = 400, code = null) => Object.assign(new Error(msg), { status, code });

// Códigos que la caja necesita distinguir sin leer el texto del mensaje: significan "esta
// cuenta ya no se puede seguir editando porque otra caja la tocó". Con ellos el POS puede
// rehacer el carrito como venta nueva en vez de dejar al cajero atascado.
const GONE = "SALE_GONE";               // la eliminaron (una cuenta en espera se borra de verdad)
const NOT_EDITABLE = "SALE_NOT_EDITABLE"; // ya la cobraron: dejó de estar en borrador/espera

// Deja el stock total del producto igual a la suma de sus existencias por almacén. Se llama
// después de cada movimiento porque products.stock es un acumulado, no la fuente de verdad.
async function syncTotalStock(productId, transaction) {
  const totalStock = await ProductStock.sum("qty", { where: { product_id: productId }, transaction });
  await Product.update({ stock: totalStock || 0 }, { where: { id: productId }, transaction });
}

module.exports = async function updateSale(saleId, body) {
  const { items, discount_amount } = body;

  if (!items?.length) throw bad("Debes incluir al menos un producto");

  const transaction = await sequelize.transaction();
  try {
    // El bloqueo va sin include: Postgres rechaza `SELECT ... FOR UPDATE` cuando la
    // consulta trae un LEFT JOIN ("FOR UPDATE cannot be applied to the nullable side of
    // an outer join"), y un include hasMany sin `required: true` genera exactamente eso.
    // Las líneas se leen aparte, dentro de la misma transacción.
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });

    if (!sale) throw bad("Esta cuenta ya no existe: otra caja la eliminó.", 404, GONE);
    // 'espera' entra aquí junto a 'borrador': es el caso de agregar rondas a una cuenta
    // abierta. Ambos comparten lo esencial — todavía no tienen correlativo asignado.
    if (!["borrador", "espera"].includes(sale.status)) {
      throw bad("Esta cuenta ya fue cobrada desde otra caja y no se puede seguir editando.", 400, NOT_EDITABLE);
    }

    const warehouseId = sale.warehouse_id;
    const previousItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });

    // ── Devolver al inventario lo que la venta tenía apartado ──
    // Un combo no descuenta de sí mismo: al venderlo se restaron sus ingredientes (ver
    // createSale y acceptWebOrder), así que aquí hay que devolver esos mismos ingredientes.
    // Restaurar sobre el combo dejaba los componentes descontados para siempre — y como la
    // validación de más abajo solo mira los productos nuevos, bastaba con quitar el combo
    // del carrito para perder inventario sin ningún aviso.
    for (const item of previousItems) {
      if (!item.product_id) continue;
      const product = await Product.findByPk(item.product_id, { transaction });
      if (!product || product.is_service) continue;

      if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        for (const cItem of comboItems) {
          const qtyToRestore = parseFloat(item.quantity) * parseFloat(cItem.quantity);
          const [stockEntry] = await ProductStock.findOrCreate({
            where: { warehouse_id: warehouseId, product_id: cItem.product_id },
            defaults: { qty: 0 },
            transaction,
            lock: true,
          });
          await stockEntry.increment("qty", { by: qtyToRestore, transaction });
          await syncTotalStock(cItem.product_id, transaction);
        }
        continue;
      }

      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id: warehouseId, product_id: item.product_id },
        transaction,
        lock: true,
      });
      if (stockEntry) {
        await stockEntry.increment("qty", { by: parseFloat(item.quantity), transaction });
        await syncTotalStock(item.product_id, transaction);
      }
    }

    // Delete all existing items
    await SaleItem.destroy({ where: { sale_id: saleId }, transaction });

    // ── Volver a apartar el inventario según el carrito nuevo ──
    // Igual criterio que createSale.js: $ acumula con el precio redondeado a 2 decimales
    // (cant×precio mostrado = total mostrado); SaleItem.price guarda precisión completa
    // (base para sale_items.subtotal, usado en la conversión a Bs).
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
    let total = 0;
    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw bad(`Producto ${item.product_id} no encontrado`, 404);

      const unitPrice = parseFloat(item.price ?? product.price);
      const qty = parseFloat(item.qty);
      if (qty <= 0) continue;

      // Costo congelado: sin esto, el reporte de márgenes recalcula la utilidad de esta
      // venta con el costo de reposición del día en que se consulte. En un combo el
      // producto no lleva costo propio: es la suma del costo de sus ingredientes.
      let unitCost = product.cost_price != null ? parseFloat(product.cost_price) : null;

      if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        if (!comboItems.length) {
          throw bad(`El combo "${product.name}" no tiene ingredientes configurados`);
        }

        // Se valida todo el combo antes de tocar nada: si falta un solo ingrediente, la
        // línea no debe quedar a medio descontar.
        const ingredientsData = [];
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          if (!ingredient) throw bad(`Un ingrediente del combo "${product.name}" ya no existe`, 404);

          const qtyNeeded = qty * parseFloat(cItem.quantity);
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id: warehouseId, product_id: ingredient.id },
            transaction,
            lock: true,
          });
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (currentQty < qtyNeeded) {
            throw bad(`Stock insuficiente del ingrediente "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}, Requerido: ${qtyNeeded}`);
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }

        const comboCost = ingredientsData.reduce(
          (acc, ing) => acc + parseFloat(ing.ingredient.cost_price || 0) * ing.qtyNeeded,
          0
        );
        unitCost = qty > 0 ? parseFloat((comboCost / qty).toFixed(5)) : null;

        for (const ing of ingredientsData) {
          await ing.stockEntry.decrement("qty", { by: ing.qtyNeeded, transaction });
          await syncTotalStock(ing.ingredient.id, transaction);
        }
      } else if (!product.is_service) {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id: warehouseId, product_id: product.id },
          transaction,
          lock: true,
        });
        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (currentQty < qty) {
          throw bad(`Stock insuficiente para "${product.name}". Disponible: ${currentQty}`);
        }
        await stockEntry.decrement("qty", { by: qty, transaction });
        await syncTotalStock(product.id, transaction);
      }

      await SaleItem.create(
        {
          sale_id: saleId,
          product_id: product.id,
          name: product.name,
          price: unitPrice,
          quantity: qty,
          discount: 0,
          cost_price: unitCost,
        },
        { transaction }
      );

      total += round2(unitPrice) * qty;
    }

    const discAmt = parseFloat(discount_amount ?? sale.discount_amount) || 0;
    // 2 decimales: sale.total es el monto "oficial" de la factura en $.
    // La precisión completa vive en sale_items (price/discount/subtotal).
    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    // Al cobrar una cuenta en espera se la pasa a 'borrador' para que el pago le asigne
    // el correlativo. Solo se admite esa transición: cualquier otro cambio de estado
    // debe pasar por su propio flujo (cobro, crédito o anulación).
    const statusPatch = (sale.status === "espera" && body.status === "borrador")
      ? { status: "borrador" }
      : {};

    // Se suelta el bloqueo: los dos flujos que llegan aquí —pausar la cuenta y cobrarla—
    // terminan vaciando el carrito de la caja, así que a partir de este punto ya no la está
    // atendiendo nadie y otra caja debe poder tomarla.
    await sale.update(
      { total, discount_amount: discAmt, held_by_employee_id: null, held_at: null, ...statusPatch },
      { transaction }
    );

    await transaction.commit();

    return await getOneSale(saleId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};