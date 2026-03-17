const pool = require("../db/pool");

// GET /api/stock-transfers
const getAll = async (req, res) => {
  try {
    const { warehouse_id, product_id, limit = 100 } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (warehouse_id) {
      params.push(warehouse_id);
      where += ` AND (st.from_warehouse_id=$${params.length} OR st.to_warehouse_id=$${params.length})`;
    }
    if (product_id) {
      params.push(product_id);
      where += ` AND st.product_id=$${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT st.*,
             fw.name       AS from_warehouse_name,
             tw.name       AS to_warehouse_name,
             e.full_name   AS employee_name
      FROM stock_transfers st
      LEFT JOIN warehouses fw ON fw.id = st.from_warehouse_id
      LEFT JOIN warehouses tw ON tw.id = st.to_warehouse_id
      LEFT JOIN employees  e  ON e.id  = st.employee_id
      ${where}
      ORDER BY st.created_at DESC
      LIMIT $${params.length}
    `, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener transferencias" });
  }
};

// POST /api/stock-transfers
const create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = req.body;
    if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty)
      return res.status(400).json({ ok: false, message: "from_warehouse_id, to_warehouse_id, product_id y qty son requeridos" });
    if (parseInt(from_warehouse_id) === parseInt(to_warehouse_id))
      return res.status(400).json({ ok: false, message: "El inventario origen y destino deben ser diferentes" });

    const qtyN = parseFloat(qty);
    if (qtyN <= 0) return res.status(400).json({ ok: false, message: "La cantidad debe ser mayor a 0" });

    await client.query("BEGIN");

    const { rows: [fromStock] } = await client.query(
      "SELECT qty FROM product_stock WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE",
      [from_warehouse_id, product_id]
    );
    const available = fromStock ? parseFloat(fromStock.qty) : 0;
    if (available < qtyN)
      throw new Error(`Stock insuficiente en inventario origen (disponible: ${available})`);

    const { rows: [prod] } = await client.query("SELECT name FROM products WHERE id=$1", [product_id]);
    if (!prod) throw new Error("Producto no encontrado");

    // Descontar origen
    await client.query(
      "UPDATE product_stock SET qty = qty - $1 WHERE warehouse_id=$2 AND product_id=$3",
      [qtyN, from_warehouse_id, product_id]
    );

    // Agregar destino
    await client.query(`
      INSERT INTO product_stock (warehouse_id, product_id, qty)
      VALUES ($1,$2,$3)
      ON CONFLICT (warehouse_id, product_id) DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty
    `, [to_warehouse_id, product_id, qtyN]);

    // Registrar transferencia
    const { rows: [transfer] } = await client.query(`
      INSERT INTO stock_transfers (from_warehouse_id, to_warehouse_id, product_id, product_name, qty, note, employee_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [from_warehouse_id, to_warehouse_id, product_id, prod.name, qtyN, note || null, req.employee?.id || null]);

    // El total no cambia (es una transferencia), pero sincronizamos products.stock por si acaso
    // (no es necesario ya que el total se mantiene igual)

    await client.query("COMMIT");
    res.status(201).json({ ok: true, data: transfer });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
};

module.exports = { getAll, create };
