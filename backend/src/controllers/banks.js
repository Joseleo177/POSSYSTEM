const { Sequelize, Bank, PaymentMethod, PaymentJournal, Sale } = require("../models");

// GET /api/banks
const getAllBanks = async (req, res) => {
  try {
    const banks = await Bank.findAll({
      attributes: {
        include: [[Sequelize.fn("COUNT", Sequelize.col("PaymentJournals.id")), "journals_count"]]
      },
      include: [{ model: PaymentJournal, attributes: [] }],
      group: ['Bank.id'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true
    });
    
    // Convert count to int to match pg behavior
    banks.forEach(b => b.journals_count = parseInt(b.journals_count || 0));
    
    res.json({ ok: true, data: banks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener bancos" });
  }
};

// POST /api/banks
const createBank = async (req, res) => {
  try {
    const { name, code, sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const bank = await Bank.create({ name: name.trim(), code: code?.trim() || null, sort_order });
    res.status(201).json({ ok: true, data: bank });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un banco con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear banco" });
  }
};

// PUT /api/banks/:id
const updateBank = async (req, res) => {
  try {
    const { name, code, active, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const bank = await Bank.findByPk(req.params.id);
    if (!bank) return res.status(404).json({ ok: false, message: "Banco no encontrado" });

    await bank.update({ name: name.trim(), code: code?.trim() || null, active: active ?? true, sort_order: sort_order ?? 0 });
    res.json({ ok: true, data: bank });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un banco con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar banco" });
  }
};

// DELETE /api/banks/:id
const deleteBank = async (req, res) => {
  try {
    const count = await PaymentJournal.count({ where: { bank_id: req.params.id } });
    if (count > 0) return res.status(400).json({ ok: false, message: `No se puede eliminar: ${count} diario(s) usan este banco. Desasígnalos primero.` });

    const bank = await Bank.findByPk(req.params.id);
    if (!bank) return res.status(404).json({ ok: false, message: "Banco no encontrado" });

    await bank.destroy();
    res.json({ ok: true, message: "Banco eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar banco" });
  }
};

// GET /api/payment-methods
const getAllMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.findAll({
      attributes: {
        include: [[Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "sales_count"]]
      },
      include: [{ model: Sale, attributes: [] }],
      group: ['PaymentMethod.id'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true
    });
    
    methods.forEach(m => m.sales_count = parseInt(m.sales_count || 0));
    res.json({ ok: true, data: methods });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener métodos de pago" });
  }
};

// POST /api/payment-methods
const createMethod = async (req, res) => {
  try {
    const { name, code, icon = "💳", color = "#555555", sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    if (!code?.trim()) return res.status(400).json({ ok: false, message: "El código es requerido" });

    const normalizedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
    const method = await PaymentMethod.create({ name: name.trim(), code: normalizedCode, icon, color, sort_order });
    res.status(201).json({ ok: true, data: method });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un método con ese nombre o código" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear método de pago" });
  }
};

// PUT /api/payment-methods/:id
const updateMethod = async (req, res) => {
  try {
    const { name, icon, color, active, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const method = await PaymentMethod.findByPk(req.params.id);
    if (!method) return res.status(404).json({ ok: false, message: "Método de pago no encontrado" });

    await method.update({ name: name.trim(), icon: icon || "💳", color: color || "#555555", active: active ?? true, sort_order: sort_order ?? 0 });
    res.json({ ok: true, data: method });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un método con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar método de pago" });
  }
};

// DELETE /api/payment-methods/:id
const deleteMethod = async (req, res) => {
  try {
    const count = await Sale.count({ where: { payment_method_id: req.params.id } });
    if (count > 0) return res.status(400).json({ ok: false, message: `No se puede eliminar: tiene ${count} venta(s) registrada(s). Solo puedes desactivarlo.` });

    const method = await PaymentMethod.findByPk(req.params.id);
    if (!method) return res.status(404).json({ ok: false, message: "Método de pago no encontrado" });

    const jcount = await PaymentJournal.count({ where: { type: method.code } });
    if (jcount > 0) return res.status(400).json({ ok: false, message: `No se puede eliminar: ${jcount} diario(s) usan este método. Cámbialos primero.` });

    await method.destroy();
    res.json({ ok: true, message: "Método de pago eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar método de pago" });
  }
};

// PUT /api/payment-methods/:id/toggle
const toggleMethod = async (req, res) => {
  try {
    const method = await PaymentMethod.findByPk(req.params.id);
    if (!method) return res.status(404).json({ ok: false, message: "Método no encontrado" });
    await method.update({ active: !method.active });
    res.json({ ok: true, data: method });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al cambiar estado" });
  }
};

// PUT /api/banks/:id/toggle
const toggleBank = async (req, res) => {
  try {
    const bank = await Bank.findByPk(req.params.id);
    if (!bank) return res.status(404).json({ ok: false, message: "Banco no encontrado" });
    await bank.update({ active: !bank.active });
    res.json({ ok: true, data: bank });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al cambiar estado" });
  }
};

module.exports = {
  getAllBanks, createBank, updateBank, deleteBank, toggleBank,
  getAllMethods, createMethod, updateMethod, deleteMethod, toggleMethod,
};