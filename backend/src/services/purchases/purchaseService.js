const {
  Purchase, PurchaseItem, ProductLot, Employee, Warehouse, Customer,
  Product, ProductStock, ProductComboItem, PurchasePayment, Sequelize, sequelize
} = require("../../models");
const { Op } = Sequelize;

async function getAll({ limit = 50, offset = 0, search, status, order_status, date_from, date_to }, req) {
  const company_id  = req.employee?.company_id ?? null;
  const isSuperuser = !!req.is_superuser;
  const where = (!isSuperuser && company_id) ? { company_id } : {};

  if (status)       where.payment_status = status;
  if (order_status) where.status = order_status;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = new Date(date_from);
    if (date_to)   where.created_at[Op.lte] = new Date(new Date(date_to).setHours(23, 59, 59, 999));
  }

  const supplierWhere = {};
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const orConds = [
      { '$Supplier.name$': { [Op.iLike]: term } },
      { '$Supplier.rif$':  { [Op.iLike]: term } },
      { notes:              { [Op.iLike]: term } },
    ];
    const asInt = parseInt(search);
    if (!isNaN(asInt)) orConds.push({ id: asInt });
    where[Op.or] = orConds;
  }

  const { count, rows: purchases } = await Purchase.findAndCountAll({
    where,
    include: [
      { model: Employee,     attributes: ['full_name'], required: false },
      { model: Customer, as: 'Supplier', attributes: ['name', 'rif'], required: false, where: Object.keys(supplierWhere).length ? supplierWhere : undefined },
      { model: Warehouse,    attributes: ['name'],      required: false },
      { model: PurchaseItem, attributes: [],            required: false }
    ],
    attributes: {
      include: [[Sequelize.fn('COUNT', Sequelize.col('PurchaseItems.id')), 'item_count']]
    },
    group: ['Purchase.id', 'Employee.id', 'Supplier.id', 'Warehouse.id'],
    order: [['created_at', 'DESC']],
    limit:    parseInt(limit),
    offset:   parseInt(offset),
    subQuery: false,
    distinct: true
  });

  const purchaseIds = purchases.map(p => p.id);
  const paidSums = purchaseIds.length
    ? await sequelize.query(
        `SELECT pp.purchase_id, COALESCE(SUM(pp.amount), 0) AS paid
           FROM purchase_payments pp
           LEFT JOIN expenses e ON e.reference = 'purchase_payment:' || pp.id::text
          WHERE pp.purchase_id IN (:ids)
            AND (e.status IS NULL OR e.status = 'activo')
          GROUP BY pp.purchase_id`,
        { replacements: { ids: purchaseIds }, type: sequelize.QueryTypes.SELECT }
      )
    : [];
  const paidMap = {};
  paidSums.forEach(r => { paidMap[r.purchase_id] = parseFloat(r.paid || 0); });

  const data = purchases.map(p => {
    const pp = p.toJSON();
    pp.employee_name          = pp.Employee?.full_name ?? null;
    pp.supplier_customer_name = pp.Supplier?.name      ?? null;
    pp.supplier_rif           = pp.Supplier?.rif       ?? null;
    pp.warehouse_name         = pp.Warehouse?.name     ?? null;
    pp.item_count             = parseInt(pp.item_count || 0);
    const amountPaid = paidMap[pp.id] || 0;
    pp.amount_paid = parseFloat(amountPaid.toFixed(6));
    pp.balance     = parseFloat(Math.max(0, parseFloat(pp.total) - amountPaid).toFixed(6));
    ['Employee','Supplier','Warehouse','PurchaseItems'].forEach(k => delete pp[k]);
    return pp;
  });

  return { data, total: count.length || count };
}

async function getOne(id) {
  const purchase = await Purchase.findByPk(id, {
    include: [
      { model: Employee,     attributes: ['full_name'], required: false },
      { model: Warehouse,    attributes: ['name'],      required: false },
      { model: PurchaseItem, include: [{ model: Product, attributes: ['image_filename'], required: false }] }
    ]
  });
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }

  const data = purchase.toJSON();
  data.employee_name  = data.Employee?.full_name ?? null;
  data.warehouse_name = data.Warehouse?.name     ?? null;
  data.items = (data.PurchaseItems ?? []).map(pi => {
    const item = { ...pi };
    item.image_filename = item.Product?.image_filename ?? null;
    delete item.Product;
    return item;
  });
  ['Employee','Warehouse','PurchaseItems'].forEach(k => delete data[k]);

  const amountPaid = await PurchasePayment.sum('amount', { where: { purchase_id: data.id } }) || 0;
  data.amount_paid = parseFloat(parseFloat(amountPaid).toFixed(6));
  data.balance     = parseFloat(Math.max(0, parseFloat(data.total) - amountPaid).toFixed(6));

  return { data };
}

// Applies stock increments, lot tracking, price/cost updates and combo creation.
// Called only when a purchase reaches status='recibido'.
async function _applyStockAndPrices(purchase, items, transaction) {
  for (const item of items) {
    const {
      product_id, total_units, unit_cost, profit_margin, sale_price,
      package_size, package_unit, package_price, lot_number, expiration_date,
      update_price
    } = item;

    if (!product_id) continue;
    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) continue;

    if (!product.is_service) {
      const [stockEntry] = await ProductStock.findOrCreate({
        where: { warehouse_id: purchase.warehouse_id, product_id },
        defaults: { qty: 0 },
        transaction,
        lock: true
      });
      await stockEntry.increment('qty', { by: total_units, transaction });

      if (lot_number && expiration_date) {
        const [lotEntry] = await ProductLot.findOrCreate({
          where: { warehouse_id: purchase.warehouse_id, product_id, lot_number: String(lot_number), expiration_date },
          defaults: { qty: 0 },
          transaction,
          lock: true
        });
        await lotEntry.increment('qty', { by: total_units, transaction });
      }
    }

    // El costo siempre se actualiza (es lo que realmente se pagó);
    // el precio de venta solo si la línea tiene update_price activo
    const productChanges = {
      cost_price: unit_cost,
      package_size,
      package_unit: package_unit || 'unidad',
      bulk_price: package_price || null,
    };
    if (update_price !== false) {
      productChanges.price = sale_price;
      productChanges.profit_margin = profit_margin;
    }
    await product.update(productChanges, { transaction });


    if (!product.is_service) {
      const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
      await Product.update({ stock: totalStock || 0 }, { where: { id: product_id }, transaction });
    }
  }
}

async function createPurchase({ body, employee_id }) {
  const { supplier_id, supplier_name, notes, items, warehouse_id, status: requestedStatus = 'borrador' } = body;

  if (!items?.length)  { const e = new Error("Debe incluir al menos un producto"); e.status = 400; throw e; }

  const initialStatus = ['borrador', 'pendiente', 'recibido'].includes(requestedStatus) ? requestedStatus : 'borrador';

  const transaction = await sequelize.transaction();
  try {
    if (warehouse_id) {
      const warehouse = await Warehouse.findByPk(warehouse_id, { transaction });
      if (!warehouse || !warehouse.active) throw new Error("Almacén no encontrado o inactivo");
    }

    let resolvedSupplierName = supplier_name || null;
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const sup = await Customer.findOne({ where: { id: resolvedSupplierId, type: 'proveedor' }, transaction });
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    const purchase = await Purchase.create({
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      notes: notes || null,
      total: 0,
      status: initialStatus,
      employee_id: employee_id || null,
      warehouse_id: warehouse_id || null
    }, { transaction });

    let grandTotal = 0;
    const createdItems = [];

    for (const item of items) {
      const {
        product_id, package_unit, package_size, package_qty, package_price,
        profit_margin, lot_number, expiration_date, update_price
      } = item;

      if (!product_id || !package_size || !package_qty)
        throw new Error("Datos incompletos en línea de compra");

      const pkgSize  = parseFloat(package_size);
      const pkgQty   = parseFloat(package_qty);
      const pkgPrice = parseFloat(package_price);
      const margin   = parseFloat(profit_margin) || 0;

      const unit_cost   = pkgPrice / pkgSize;
      const sale_price  = unit_cost * (1 + margin / 100);
      const total_units = pkgQty * pkgSize;
      const subtotal    = pkgQty * pkgPrice;
      grandTotal += subtotal;

      const product = await Product.findByPk(product_id, { transaction });
      if (!product) throw new Error(`Producto ID ${product_id} no encontrado`);

      const purchaseItem = await PurchaseItem.create({
        purchase_id: purchase.id,
        product_id,
        product_name: product.name,
        package_unit: package_unit || "unidad",
        package_qty: pkgQty,
        package_size: pkgSize,
        package_price: pkgPrice,
        unit_cost,
        profit_margin: margin,
        sale_price,
        total_units,
        subtotal,
        lot_number: lot_number || null,
        expiration_date: expiration_date || null,
        update_price: update_price !== false && update_price !== 'false'
      }, { transaction });

      createdItems.push(purchaseItem);
    }

    await purchase.update({ total: grandTotal }, { transaction });

    if (initialStatus === 'recibido') {
      await _applyStockAndPrices(purchase, createdItems.map(i => i.toJSON()), transaction);
    }

    await transaction.commit();

    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Employee,  attributes: ['full_name'], required: false },
        { model: Warehouse, attributes: ['name'],      required: false },
        { model: PurchaseItem }
      ]
    });
    const resultData = fullPurchase.toJSON();
    resultData.employee_name  = resultData.Employee?.full_name ?? null;
    resultData.warehouse_name = resultData.Warehouse?.name     ?? null;
    resultData.items = resultData.PurchaseItems ?? [];
    ['Employee','Warehouse','PurchaseItems'].forEach(k => delete resultData[k]);

    return { data: resultData };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function confirmOrder(id) {
  const purchase = await Purchase.findByPk(id);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  if (purchase.status !== 'borrador') {
    const e = new Error("Solo se pueden confirmar órdenes en estado borrador"); e.status = 400; throw e;
  }
  await purchase.update({ status: 'pendiente' });
  return getOne(id);
}

async function receivePurchase(id) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(id, { transaction, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    if (purchase.status === 'recibido') {
      const e = new Error("Esta compra ya fue recibida"); e.status = 400; throw e;
    }

    const items = await PurchaseItem.findAll({ where: { purchase_id: id }, transaction });
    await _applyStockAndPrices(purchase, items.map(i => i.toJSON()), transaction);
    await purchase.update({ status: 'recibido' }, { transaction });

    await transaction.commit();
    return getOne(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function deletePurchase(id) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(id, { transaction, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }

    // Only revert stock if goods were actually received
    if (purchase.status === 'recibido') {
      const items = await PurchaseItem.findAll({ where: { purchase_id: purchase.id }, transaction });

      for (const item of items) {
        if (!item.product_id) continue;
        const fullProd = await Product.findByPk(item.product_id, { transaction });
        if (fullProd && !fullProd.is_service) {
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id: purchase.warehouse_id, product_id: item.product_id },
            transaction,
            lock: true
          });
          if (stockEntry) {
            const currentQty    = parseFloat(stockEntry.qty || 0);
            const qtyToSubtract = parseFloat(item.total_units || 0);
            if (currentQty < qtyToSubtract)
              throw new Error(`No se puede anular la compra: el producto "${item.product_name}" ya ha sido vendido o movido. Stock disponible: ${currentQty}, Requerido para anular: ${qtyToSubtract}`);
            await stockEntry.decrement('qty', { by: qtyToSubtract, transaction });
          }
          const totalStock = await ProductStock.sum('qty', { where: { product_id: item.product_id }, transaction });
          await Product.update({ stock: totalStock || 0 }, { where: { id: item.product_id }, transaction });
        }
      }
    }

    await purchase.destroy({ transaction });
    await transaction.commit();
    return { message: purchase.status === 'recibido' ? "Compra anulada y stock revertido" : "Orden eliminada" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateDraft(id, { warehouse_id, supplier_id, supplier_name, notes, items }) {
  const purchase = await Purchase.findByPk(id);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  if (!['borrador', 'pendiente'].includes(purchase.status)) {
    const e = new Error("Solo se pueden editar órdenes en estado borrador o pendiente"); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    let resolvedSupplierName = supplier_name || null;
    if (resolvedSupplierId) {
      const sup = await Customer.findOne({ where: { id: resolvedSupplierId, type: 'proveedor' }, transaction });
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    await PurchaseItem.destroy({ where: { purchase_id: id }, transaction });

    let grandTotal = 0;
    if (items?.length) {
      for (const item of items) {
        const { product_id, package_unit, package_size, package_qty, package_price, profit_margin, lot_number, expiration_date, update_price } = item;
        if (!product_id || !package_size || !package_qty)
          throw new Error("Datos incompletos en línea de compra");

        const pkgSize  = parseFloat(package_size);
        const pkgQty   = parseFloat(package_qty);
        const pkgPrice = parseFloat(package_price) || 0;
        const margin   = parseFloat(profit_margin) || 0;
        const unit_cost   = pkgPrice > 0 ? pkgPrice / pkgSize : 0;
        const sale_price  = unit_cost * (1 + margin / 100);
        const total_units = pkgQty * pkgSize;
        const subtotal    = pkgQty * pkgPrice;
        grandTotal += subtotal;

        const product = await Product.findByPk(product_id, { transaction });
        if (!product) throw new Error(`Producto ID ${product_id} no encontrado`);

        await PurchaseItem.create({
          purchase_id: id,
          product_id,
          product_name: product.name,
          package_unit: package_unit || "unidad",
          package_qty: pkgQty,
          package_size: pkgSize,
          package_price: pkgPrice,
          unit_cost,
          profit_margin: margin,
          sale_price,
          total_units,
          subtotal,
          lot_number: lot_number || null,
          expiration_date: expiration_date || null,
          update_price: update_price !== false && update_price !== 'false'
        }, { transaction });
      }
    }

    const updateData = {
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      notes: notes || null,
      total: grandTotal,
    };
    if (warehouse_id) updateData.warehouse_id = parseInt(warehouse_id);
    else updateData.warehouse_id = null;

    await purchase.update(updateData, { transaction });
    await transaction.commit();
    return getOne(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateItemLots(purchaseId, items) {
  const purchase = await Purchase.findByPk(purchaseId);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  if (purchase.status === 'recibido') { const e = new Error("Esta compra ya fue recibida"); e.status = 400; throw e; }

  for (const { id, lot_number, expiration_date } of items) {
    await PurchaseItem.update(
      { lot_number: lot_number || null, expiration_date: expiration_date || null },
      { where: { id, purchase_id: purchaseId } }
    );
  }
  return getOne(purchaseId);
}

module.exports = { getAll, getOne, createPurchase, updateDraft, confirmOrder, receivePurchase, updateItemLots, deletePurchase };
