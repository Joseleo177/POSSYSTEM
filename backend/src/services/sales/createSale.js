const {
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  Warehouse,
  Product,
  ProductStock,
  Serie,
  SerieRange,
  ProductComboItem,
  Sequelize,
  sequelize,
  PAYMENT_METHODS,
} = require("./shared");

module.exports = async function createSale(body) {
  const transaction = await sequelize.transaction();
  try {
    const { items, paid, customer_id, employee_id, currency_id, exchange_rate, payment_method, serie_id, discount_amount, warehouse_id } =
      body;

    if (!items?.length) throw new Error("items es requerido");
    if (paid == null) throw new Error("paid es requerido");
    if (!warehouse_id) throw new Error("warehouse_id es requerido");
    if (!serie_id) throw new Error("La serie es requerida");

    const serie = await Serie.findByPk(serie_id, { transaction });
    if (!serie || !serie.active) throw new Error("Serie no encontrada o inactiva");

    const activeRange = await SerieRange.findOne({
      where: {
        serie_id,
        active: true,
        current_number: { [Sequelize.Op.lte]: Sequelize.col("end_number") },
      },
      order: [["start_number", "ASC"]],
      lock: true,
      transaction,
    });
    if (!activeRange) throw new Error(`Serie "${serie.name}" agotada. Añade un nuevo rango en Contabilidad.`);

    const correlativeNumber = activeRange.current_number;
    const paddedNumber = String(correlativeNumber).padStart(serie.padding, "0");
    const invoiceNumber = `${serie.prefix}-${paddedNumber}`;

    const nextNumber = correlativeNumber + 1;
    if (nextNumber > activeRange.end_number) {
      await activeRange.update({ current_number: nextNumber, active: false }, { transaction });
    } else {
      await activeRange.update({ current_number: nextNumber }, { transaction });
    }

    const method = PAYMENT_METHODS.includes(payment_method) ? payment_method : "efectivo";
    const discAmt = parseFloat(discount_amount) || 0;
    const rate = parseFloat(exchange_rate) || 1;

    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      if (product.is_service) {
        total += parseFloat(product.price) * item.quantity;
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, isService: true });
      } else if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        if (!comboItems || comboItems.length === 0) {
          throw new Error(`El combo "${product.name}" no tiene ingredientes configurados`);
        }

        const ingredientsData = [];
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          const qtyNeeded = item.quantity * parseFloat(cItem.quantity);

          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id, product_id: ingredient.id },
            transaction,
            lock: true,
          });
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (currentQty < qtyNeeded) {
            throw new Error(
              `Stock insuficiente del ingrediente "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}, Requerido: ${qtyNeeded}`
            );
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }

        total += parseFloat(product.price) * item.quantity;
        enrichedItems.push({ product, qty: item.quantity, isCombo: true, ingredientsData });
      } else {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id, product_id: product.id },
          transaction,
          lock: true,
        });

        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (currentQty < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}" en este almacén. Disponible: ${currentQty}`);
        }

        total += parseFloat(product.price) * item.quantity;
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, stockEntry });
      }
    }

    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    const paidBase = parseFloat(paid) || 0;
    const change = 0;

    const sale = await Sale.create(
      {
        total,
        paid: paidBase,
        change,
        customer_id: customer_id || null,
        employee_id: employee_id || null,
        currency_id: currency_id || null,
        exchange_rate: rate,
        discount_amount: discAmt,
        payment_method: method,
        warehouse_id,
        serie_id: serie.id,
        serie_range_id: activeRange.id,
        correlative_number: correlativeNumber,
        invoice_number: invoiceNumber,
      },
      { transaction }
    );

    for (const entry of enrichedItems) {
      await SaleItem.create(
        {
          sale_id: sale.id,
          product_id: entry.product.id,
          name: entry.product.name,
          price: entry.product.price,
          quantity: entry.qty,
          discount: 0,
        },
        { transaction }
      );

      if (entry.isService) {
        // no-op
      } else if (entry.isCombo) {
        for (const ing of entry.ingredientsData) {
          await ing.stockEntry.decrement("qty", { by: ing.qtyNeeded, transaction });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: ing.ingredient.id }, transaction });
          await ing.ingredient.update({ stock: totalStock || 0 }, { transaction });
        }
      } else {
        await entry.stockEntry.decrement("qty", { by: entry.qty, transaction });
        const totalStock = await ProductStock.sum("qty", { where: { product_id: entry.product.id }, transaction });
        await entry.product.update({ stock: totalStock || 0 }, { transaction });
      }
    }

    await transaction.commit();

    const fullSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Customer, attributes: ["name", "rif"] },
        { model: Employee, attributes: ["full_name"] },
        { model: Currency, attributes: ["symbol", "code"] },
        { model: Warehouse, attributes: ["name"] },
        { model: Serie, attributes: ["name", "prefix", "padding"] },
        { model: SaleItem },
      ],
    });

    const data = fullSale.toJSON();
    data.customer_name = data.Customer?.name ?? null;
    data.customer_rif  = data.Customer?.rif ?? null;
    data.employee_name = data.Employee?.full_name ?? null;
    data.currency_symbol = data.Currency?.symbol ?? null;
    data.currency_code = data.Currency?.code ?? null;
    data.warehouse_name = data.Warehouse?.name ?? null;
    data.serie_name = data.Serie?.name ?? null;
    data.items = data.SaleItems ?? [];
    ["Customer", "Employee", "Currency", "Warehouse", "Serie", "SaleItems"].forEach((k) => delete data[k]);

    return data;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
