const { Purchase, PurchaseItem, Employee, Warehouse, Customer, Product, ProductStock, Sequelize, sequelize } = require("../models");

// GET /api/purchases
const getAll = async (req, res) => {
  try {
    const purchases = await Purchase.findAll({
      include: [
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Customer, as: 'Supplier', attributes: ['name', 'rif'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: PurchaseItem, attributes: [], required: false }
      ],
      attributes: {
        include: [[Sequelize.fn('COUNT', Sequelize.col('PurchaseItems.id')), 'item_count']]
      },
      group: ['Purchase.id', 'Employee.id', 'Supplier.id', 'Warehouse.id'],
      order: [['created_at', 'DESC']],
      limit: 200,
      subQuery: false
    });

    const data = purchases.map(p => {
      const pp = p.toJSON();
      pp.employee_name          = pp.Employee?.full_name ?? null;
      pp.supplier_customer_name = pp.Supplier?.name     ?? null;
      pp.supplier_rif           = pp.Supplier?.rif      ?? null;
      pp.warehouse_name         = pp.Warehouse?.name    ?? null;
      pp.item_count             = parseInt(pp.item_count || 0);
      ['Employee','Supplier','Warehouse','PurchaseItems'].forEach(k => delete pp[k]);
      return pp;
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener compras" });
  }
};

// GET /api/purchases/:id
const getOne = async (req, res) => {
  try {
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: PurchaseItem, include: [{ model: Product, attributes: ['image_filename'], required: false }] }
      ]
    });
    if (!purchase) return res.status(404).json({ ok: false, message: "Compra no encontrada" });

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

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener compra" });
  }
};

// POST /api/purchases
const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { supplier_id, supplier_name, notes, items, warehouse_id } = req.body;

    if (!items || !items.length) throw new Error("Debe incluir al menos un producto");
    if (!warehouse_id)           throw new Error("warehouse_id es requerido");

    const warehouse = await Warehouse.findByPk(warehouse_id, { transaction });
    if (!warehouse || !warehouse.active) throw new Error("Almacén no encontrado o inactivo");

    let resolvedSupplierName = supplier_name || null;
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const sup = await Customer.findOne({ 
        where: { id: resolvedSupplierId, type: 'proveedor' }, 
        transaction 
      });
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    const purchase = await Purchase.create({
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      notes: notes || null,
      total: 0,
      employee_id: req.employee?.id || null,
      warehouse_id
    }, { transaction });

    let grandTotal = 0;
    for (const item of items) {
      const { product_id, package_unit, package_size, package_qty, package_price, profit_margin, update_price = true } = item;
      if (!product_id || !package_size || !package_qty || !package_price) throw new Error("Datos incompletos en línea de compra");

      const pkgSize  = parseFloat(package_size);
      const pkgQty   = parseFloat(package_qty);
      const pkgPrice = parseFloat(package_price);
      const margin   = parseFloat(profit_margin) || 0;

      const unit_cost   = pkgPrice / pkgSize;
      const sale_price  = unit_cost * (1 + margin / 100);
      const total_units = pkgQty * pkgSize;
      const subtotal    = pkgQty * pkgPrice;
      grandTotal += subtotal;

      const product = await Product.findByPk(product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ID ${product_id} no encontrado`);

      await PurchaseItem.create({
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
        subtotal
      }, { transaction });

      // Incrementar stock en almacén
      const [stockEntry] = await ProductStock.findOrCreate({
        where: { warehouse_id, product_id },
        defaults: { qty: 0 },
        transaction,
        lock: true
      });
      await stockEntry.increment('qty', { by: total_units, transaction });

      // Actualizar datos del producto
      const updateData = {
        cost_price: unit_cost,
        profit_margin: margin,
        package_size: pkgSize,
        package_unit: package_unit || "unidad"
      };
      if (update_price) updateData.price = sale_price;
      
      await product.update(updateData, { transaction });

      // Sincronizar stock total
      const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
      await product.update({ stock: totalStock }, { transaction });
    }

    await purchase.update({ total: grandTotal }, { transaction });
    await transaction.commit();

    // Respuesta enriquecida
    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: PurchaseItem }
      ]
    });
    const resultData = fullPurchase.toJSON();
    resultData.employee_name  = resultData.Employee?.full_name ?? null;
    resultData.warehouse_name = resultData.Warehouse?.name     ?? null;
    resultData.items = resultData.PurchaseItems ?? [];
    ['Employee','Warehouse','PurchaseItems'].forEach(k => delete resultData[k]);

    res.status(201).json({ ok: true, data: resultData });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al crear compra" });
  }
};

// DELETE /api/purchases/:id
const remove = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(req.params.id, { 
      include: [{ model: PurchaseItem }], 
      transaction, 
      lock: true 
    });
    
    if (!purchase) throw new Error("Compra no encontrada");

    for (const item of purchase.PurchaseItems) {
      if (!item.product_id) continue;
      
      // Restar del almacén
      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id: purchase.warehouse_id, product_id: item.product_id },
        transaction,
        lock: true
      });
      if (stockEntry) {
        await stockEntry.decrement('qty', { by: item.total_units, transaction });
      }

      // Sincronizar stock total
      const totalStock = await ProductStock.sum('qty', { where: { product_id: item.product_id }, transaction });
      await Product.update({ stock: totalStock }, { where: { id: item.product_id }, transaction });
    }

    await purchase.destroy({ transaction });
    await transaction.commit();
    res.json({ ok: true, message: "Compra anulada y stock revertido" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al anular compra" });
  }
};

module.exports = { getAll, getOne, create, remove };