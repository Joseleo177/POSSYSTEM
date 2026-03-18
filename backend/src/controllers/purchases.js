const pool = require("../db/pool");
const { Purchase, PurchaseItem, Employee, Warehouse, Customer, Product } = require("../models");

// GET /api/purchases
const getAll = async (req, res) => {
  try {
    const purchases = await Purchase.findAll({
      include: [
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Customer, as: 'Supplier', attributes: ['name', 'rif'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: PurchaseItem, attributes: [] }
      ],
      attributes: {
        include: [[require('sequelize').fn('COUNT', require('sequelize').col('PurchaseItems.id')), 'item_count']]
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

// POST /api/purchases — uses raw transactions for integrity
const create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { supplier_id, supplier_name, notes, items, warehouse_id } = req.body;

    if (!items || !items.length) return res.status(400).json({ ok: false, message: "Debe incluir al menos un producto" });
    if (!warehouse_id)           return res.status(400).json({ ok: false, message: "warehouse_id es requerido" });

    const { rows: [warehouse] } = await pool.query("SELECT id FROM warehouses WHERE id = $1 AND active = TRUE", [warehouse_id]);
    if (!warehouse) return res.status(400).json({ ok: false, message: "Almacén no encontrado o inactivo" });

    await client.query("BEGIN");

    let resolvedSupplierName = supplier_name || null;
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const { rows: [sup] } = await client.query("SELECT name, tax_name FROM customers WHERE id=$1 AND type='proveedor'", [resolvedSupplierId]);
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    const { rows: [purchase] } = await client.query(
      `INSERT INTO purchases (supplier_id, supplier_name, notes, total, employee_id, warehouse_id) VALUES ($1,$2,$3,0,$4,$5) RETURNING *`,
      [resolvedSupplierId, resolvedSupplierName, notes || null, req.employee?.id || null, warehouse_id]
    );

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

      const { rows: [prod] } = await client.query("SELECT name FROM products WHERE id=$1 FOR UPDATE", [product_id]);
      if (!prod) throw new Error(`Producto ID ${product_id} no encontrado`);

      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, package_unit, package_qty, package_size, package_price, unit_cost, profit_margin, sale_price, total_units, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [purchase.id, product_id, prod.name, package_unit || "unidad", pkgQty, pkgSize, pkgPrice, unit_cost, margin, sale_price, total_units, subtotal]
      );

      await client.query(
        `INSERT INTO product_stock (warehouse_id, product_id, qty) VALUES ($1,$2,$3) ON CONFLICT (warehouse_id, product_id) DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty`,
        [warehouse_id, product_id, total_units]
      );

      if (update_price) {
        await client.query(
          `UPDATE products SET cost_price=$1, profit_margin=$2, package_size=$3, package_unit=$4, price=$5 WHERE id=$6`,
          [unit_cost, margin, pkgSize, package_unit || "unidad", sale_price, product_id]
        );
      } else {
        await client.query(
          `UPDATE products SET cost_price=$1, profit_margin=$2, package_size=$3, package_unit=$4 WHERE id=$5`,
          [unit_cost, margin, pkgSize, package_unit || "unidad", product_id]
        );
      }

      await client.query(`UPDATE products SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id=$1) WHERE id=$1`, [product_id]);
    }

    await client.query("UPDATE purchases SET total=$1 WHERE id=$2", [grandTotal, purchase.id]);
    await client.query("COMMIT");

    // Use Sequelize for the enriched response
    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: PurchaseItem }
      ]
    });
    const data = fullPurchase.toJSON();
    data.employee_name  = data.Employee?.full_name ?? null;
    data.warehouse_name = data.Warehouse?.name     ?? null;
    data.items = data.PurchaseItems ?? [];
    ['Employee','Warehouse','PurchaseItems'].forEach(k => delete data[k]);

    res.status(201).json({ ok: true, data });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al crear compra" });
  } finally {
    client.release();
  }
};

// DELETE /api/purchases/:id
const remove = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [purchase] } = await client.query("SELECT id, warehouse_id FROM purchases WHERE id=$1", [req.params.id]);
    if (!purchase) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Compra no encontrada" });
    }
    const { rows: items } = await client.query("SELECT * FROM purchase_items WHERE purchase_id=$1", [req.params.id]);

    for (const item of items) {
      if (!item.product_id) continue;
      if (purchase.warehouse_id) {
        await client.query(`UPDATE product_stock SET qty = GREATEST(0, qty - $1) WHERE warehouse_id = $2 AND product_id = $3`, [item.total_units, purchase.warehouse_id, item.product_id]);
      }
      await client.query(`UPDATE products SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id=$1) WHERE id=$1`, [item.product_id]);
    }

    await client.query("DELETE FROM purchases WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Compra anulada y stock revertido" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al anular compra" });
  } finally {
    client.release();
  }
};

module.exports = { getAll, getOne, create, remove };