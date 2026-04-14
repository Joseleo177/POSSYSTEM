const { Purchase, PurchaseItem, ProductLot, Employee, Warehouse, Customer, Product, ProductStock, ProductComboItem, PurchasePayment, Sequelize, sequelize } = require("../models");

// GET /api/purchases
const getAll = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { count, rows: purchases } = await Purchase.findAndCountAll({
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
      limit: parseInt(limit),
      offset: parseInt(offset),
      subQuery: false,
      distinct: true
    });

    // Sumar pagos por compra en una sola query
    const purchaseIds = purchases.map(p => p.id);
    const paidSums = purchaseIds.length
      ? await PurchasePayment.findAll({
          attributes: ['purchase_id', [Sequelize.fn('SUM', Sequelize.col('amount')), 'paid']],
          where: { purchase_id: purchaseIds },
          group: ['purchase_id'],
          raw: true,
        })
      : [];
    const paidMap = {};
    paidSums.forEach(r => { paidMap[r.purchase_id] = parseFloat(r.paid || 0); });

    const data = purchases.map(p => {
      const pp = p.toJSON();
      pp.employee_name          = pp.Employee?.full_name ?? null;
      pp.supplier_customer_name = pp.Supplier?.name     ?? null;
      pp.supplier_rif           = pp.Supplier?.rif      ?? null;
      pp.warehouse_name         = pp.Warehouse?.name    ?? null;
      pp.item_count             = parseInt(pp.item_count || 0);
      const amountPaid = paidMap[pp.id] || 0;
      pp.amount_paid  = parseFloat(amountPaid.toFixed(2));
      pp.balance      = parseFloat(Math.max(0, parseFloat(pp.total) - amountPaid).toFixed(2));
      ['Employee','Supplier','Warehouse','PurchaseItems'].forEach(k => delete pp[k]);
      return pp;
    });

    res.json({ ok: true, data, total: count.length || count }); // when grouping count might be an array
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

    const amountPaid = await PurchasePayment.sum('amount', { where: { purchase_id: data.id } }) || 0;
    data.amount_paid = parseFloat(parseFloat(amountPaid).toFixed(2));
    data.balance     = parseFloat(Math.max(0, parseFloat(data.total) - amountPaid).toFixed(2));

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
      const { 
        product_id, package_unit, package_size, package_qty, package_price, 
        profit_margin, update_price = true,
        lot_number, expiration_date 
      } = item;
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
        subtotal,
        lot_number: lot_number || null,
        expiration_date: expiration_date || null
      }, { transaction });

      // Incrementar stock en almacén (SÓLO si no es servicio)
      if (!product.is_service) {
        const [stockEntry] = await ProductStock.findOrCreate({
          where: { warehouse_id, product_id },
          defaults: { qty: 0 },
          transaction,
          lock: true
        });
        await stockEntry.increment('qty', { by: total_units, transaction });

        // Registrar/Incrementar stock por LOTE
        if (lot_number && expiration_date) {
            const [lotEntry] = await ProductLot.findOrCreate({
                where: { 
                    warehouse_id, 
                    product_id, 
                    lot_number: String(lot_number), 
                    expiration_date 
                },
                defaults: { qty: 0 },
                transaction,
                lock: true
            });
            await lotEntry.increment('qty', { by: total_units, transaction });
        }
      }

      // Actualizar datos del producto
      const updateData = {
        cost_price: unit_cost,
        profit_margin: margin,
        package_size: pkgSize,
        package_unit: package_unit || "unidad"
      };
      if (update_price) updateData.price = sale_price;
      
      await product.update(updateData, { transaction });

      // Auto-crear producto Combo si se compró en paquete/bulto y NO es "unidad"
      const isUnidad = !package_unit || package_unit.toLowerCase().trim() === 'unidad';
      if (pkgSize > 1 && !isUnidad) {
        const pkgUnitName = package_unit.charAt(0).toUpperCase() + package_unit.slice(1);
        const comboName = `${pkgUnitName} de ${product.name} (${pkgSize})`;
        const comboSalePrice = pkgPrice * (1 + margin / 100);

        const [comboProduct, createdCombo] = await Product.findOrCreate({
          where: { name: comboName, is_combo: true },
          defaults: {
            price: comboSalePrice,
            stock: 0,
            unit: 'unidad',
            category_id: product.category_id,
            image_filename: product.image_filename,
            is_combo: true
          },
          transaction,
          lock: true
        });

        if (createdCombo) {
          await ProductComboItem.create({
            combo_id: comboProduct.id,
            product_id: product.id,
            quantity: pkgSize
          }, { transaction });
        } else if (update_price) {
          await comboProduct.update({ price: comboSalePrice }, { transaction });
        }

        // Siempre ligar el combo al almacén destino (puede ser un almacén nuevo aunque el combo ya exista)
        await ProductStock.findOrCreate({
          where: { warehouse_id, product_id: comboProduct.id },
          defaults: { qty: 0 },
          transaction
        });
      }

      // Sincronizar stock total
      if (!product.is_service) {
        const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
        await product.update({ stock: totalStock || 0 }, { transaction });
      }
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
    // 1. Bloquear la compra (sin include para evitar error de PostgreSQL con outer join + FOR UPDATE)
    const purchase = await Purchase.findByPk(req.params.id, { 
      transaction, 
      lock: true 
    });
    
    if (!purchase) throw new Error("Compra no encontrada");

    // 2. Cargar los ítems por separado (o refrescar con include pero sin lock)
    const items = await PurchaseItem.findAll({
      where: { purchase_id: purchase.id },
      transaction
    });

    for (const item of items) {
      if (!item.product_id) continue;
      
      // Restar del almacén (SÓLO si no es servicio)
      const fullProd = await Product.findByPk(item.product_id, { transaction });
      if (fullProd && !fullProd.is_service) {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id: purchase.warehouse_id, product_id: item.product_id },
          transaction,
          lock: true
        });
        if (stockEntry) {
          const currentQty = parseFloat(stockEntry.qty || 0);
          const qtyToSubtract = parseFloat(item.total_units || 0);
          
          if (currentQty < qtyToSubtract) {
            throw new Error(`No se puede anular la compra: el producto "${item.product_name}" ya ha sido vendido o movido. Stock disponible: ${currentQty}, Requerido para anular: ${qtyToSubtract}`);
          }
          
          await stockEntry.decrement('qty', { by: qtyToSubtract, transaction });
        }

        // Sincronizar stock total
        const totalStock = await ProductStock.sum('qty', { where: { product_id: item.product_id }, transaction });
        await Product.update({ stock: totalStock || 0 }, { where: { id: item.product_id }, transaction });
      }
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