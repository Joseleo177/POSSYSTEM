const { Sequelize, Customer, Sale, Purchase } = require("../models");

// GET /api/customers
const getAll = async (req, res) => {
  try {
    const { search, type } = req.query;
    const where = {};
    if (type && ["cliente", "proveedor"].includes(type)) where.type = type;
    if (search) {
      where[Sequelize.Op.or] = [
        { name: { [Sequelize.Op.iLike]: `%${search}%` } },
        { phone: { [Sequelize.Op.iLike]: `%${search}%` } },
        { email: { [Sequelize.Op.iLike]: `%${search}%` } },
        { rif: { [Sequelize.Op.iLike]: `%${search}%` } },
        { tax_name: { [Sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const customers = await Customer.findAll({
      where,
      attributes: {
        include: [
          [Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "total_purchases"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("Sales.total")), 0), "total_spent"]
        ]
      },
      include: [{ model: Sale, attributes: [] }],
      group: ['Customer.id'],
      order: [['name', 'ASC']],
      // We use raw:false because group on non-raw queries in Sequelize requires raw output to map custom attributes properly, or we can use raw: true
      raw: true
    });
    
    customers.forEach(c => {
      c.total_purchases = parseInt(c.total_purchases || 0);
      c.total_spent = parseFloat(c.total_spent || 0);
    });

    res.json({ ok: true, data: customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/customers/:id
const getOne = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id },
      attributes: {
        include: [
          [Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "total_purchases"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("Sales.total")), 0), "total_spent"],
          [Sequelize.fn("MAX", Sequelize.col("Sales.created_at")), "last_purchase_at"]
        ]
      },
      include: [{ model: Sale, attributes: [] }],
      group: ['Customer.id'],
      raw: true
    });
    
    if (!customer) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
    
    customer.total_purchases = parseInt(customer.total_purchases || 0);
    customer.total_spent = parseFloat(customer.total_spent || 0);
    
    res.json({ ok: true, data: customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener cliente" });
  }
};

// GET /api/customers/:id/purchases
const getPurchases = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const customer = await Customer.findByPk(req.params.id, { attributes: ['id', 'name'] });
    if (!customer) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });

    const { count, rows } = await Sale.findAndCountAll({
      where: { customer_id: req.params.id },
      attributes: ['id', 'total', 'paid', 'change', 'created_at'],
      include: [{
        model: SaleItem,
        attributes: ['name', 'price', 'quantity', 'subtotal']
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Sequelize mapped automatically the 1:N relationship
    const data = rows.map(s => {
      const sale = s.toJSON();
      sale.items = sale.SaleItems; // format expected by frontend
      delete sale.SaleItems;
      return sale;
    });

    res.json({ ok: true, customer, data, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener historial" });
  }
};

// POST /api/customers
const create = async (req, res) => {
  try {
    const { type, name, phone, email, address, rif, tax_name, notes } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    const recordType = ["cliente", "proveedor"].includes(type) ? type : "cliente";

    const customer = await Customer.create({
      type: recordType,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      rif: rif ? rif.toUpperCase() : null,
      tax_name: recordType === "proveedor" ? (tax_name || null) : null,
      notes: notes || null
    });
    
    res.status(201).json({ ok: true, data: customer });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.parent?.constraint?.includes("email") ? "correo" : "RIF/Cédula";
      return res.status(409).json({ ok: false, message: `Ese ${field} ya está registrado` });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear registro" });
  }
};

// PUT /api/customers/:id
const update = async (req, res) => {
  try {
    const { type, name, phone, email, address, rif, tax_name, notes } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    const recordType = ["cliente", "proveedor"].includes(type) ? type : "cliente";

    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ ok: false, message: "Registro no encontrado" });

    await customer.update({
      type: recordType,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      rif: rif ? rif.toUpperCase() : null,
      tax_name: recordType === "proveedor" ? (tax_name || null) : null,
      notes: notes || null
    });
    
    res.json({ ok: true, data: customer });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.parent?.constraint?.includes("email") ? "correo" : "RIF/Cédula";
      return res.status(409).json({ ok: false, message: `Ese ${field} ya está registrado` });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar registro" });
  }
};

// DELETE /api/customers/:id
const remove = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ ok: false, message: "Registro no encontrado" });
    
    // Verificar si tiene ventas (como cliente)
    const saleCount = await Sale.count({ where: { customer_id: req.params.id } });
    if (saleCount > 0) return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene ventas asociadas" });

    // Verificar si tiene compras (como proveedor)
    const purchaseCount = await Purchase.count({ where: { supplier_id: req.params.id } });
    if (purchaseCount > 0) return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene compras asociadas" });

    await customer.destroy();
    res.json({ ok: true, message: "Registro eliminado exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar registro" });
  }
};

module.exports = { getAll, getOne, getPurchases, create, update, remove };
