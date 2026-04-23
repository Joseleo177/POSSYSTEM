const { Sequelize, Bank, PaymentMethod, PaymentJournal, Sale } = require("../../models");

function wrapUnique(err, label) {
  if (err.name === "SequelizeUniqueConstraintError") {
    const e = new Error(`Ya existe ${label} con ese nombre`);
    e.status = 409; throw e;
  }
  throw err;
}

async function getAllBanks() {
  const banks = await Bank.findAll({
    attributes: { include: [[Sequelize.fn("COUNT", Sequelize.col("PaymentJournals.id")), "journals_count"]] },
    include: [{ model: PaymentJournal, attributes: [] }],
    group: ["Bank.id"],
    order: [["sort_order", "ASC"], ["name", "ASC"]],
    raw: true,
  });
  banks.forEach(b => b.journals_count = parseInt(b.journals_count || 0));
  return { data: banks };
}

async function createBank({ name, code, sort_order = 0 }) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  try {
    const bank = await Bank.create({ name: name.trim(), code: code?.trim() || null, sort_order });
    return { data: bank };
  } catch (err) { wrapUnique(err, "un banco"); }
}

async function updateBank(id, { name, code, active, sort_order }) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const bank = await Bank.findByPk(id);
  if (!bank) { const e = new Error("Banco no encontrado"); e.status = 404; throw e; }
  try {
    await bank.update({ name: name.trim(), code: code?.trim() || null, active: active ?? true, sort_order: sort_order ?? 0 });
    return { data: bank };
  } catch (err) { wrapUnique(err, "un banco"); }
}

async function deleteBank(id) {
  const count = await PaymentJournal.count({ where: { bank_id: id } });
  if (count > 0) {
    const e = new Error(`No se puede eliminar: ${count} diario(s) usan este banco. Desasígnalos primero.`);
    e.status = 400; throw e;
  }
  const bank = await Bank.findByPk(id);
  if (!bank) { const e = new Error("Banco no encontrado"); e.status = 404; throw e; }
  await bank.destroy();
  return { message: "Banco eliminado" };
}

async function toggleBank(id) {
  const bank = await Bank.findByPk(id);
  if (!bank) { const e = new Error("Banco no encontrado"); e.status = 404; throw e; }
  await bank.update({ active: !bank.active });
  return { data: bank };
}

async function getAllMethods() {
  const methods = await PaymentMethod.findAll({
    attributes: { include: [[Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "sales_count"]] },
    include: [{ model: Sale, attributes: [] }],
    group: ["PaymentMethod.id"],
    order: [["sort_order", "ASC"], ["name", "ASC"]],
    raw: true,
  });
  methods.forEach(m => m.sales_count = parseInt(m.sales_count || 0));
  return { data: methods };
}

async function createMethod({ name, code, color = "#555555", sort_order = 0 }) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  if (!code?.trim()) { const e = new Error("El código es requerido"); e.status = 400; throw e; }
  const normalizedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
  try {
    const method = await PaymentMethod.create({ name: name.trim(), code: normalizedCode, color, sort_order });
    return { data: method };
  } catch (err) { wrapUnique(err, "un método"); }
}

async function updateMethod(id, { name, color, active, sort_order }) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const method = await PaymentMethod.findByPk(id);
  if (!method) { const e = new Error("Método de pago no encontrado"); e.status = 404; throw e; }
  try {
    await method.update({ name: name.trim(), color: color || "#555555", active: active ?? true, sort_order: sort_order ?? 0 });
    return { data: method };
  } catch (err) { wrapUnique(err, "un método"); }
}

async function deleteMethod(id) {
  const saleCount = await Sale.count({ where: { payment_method_id: id } });
  if (saleCount > 0) {
    const e = new Error(`No se puede eliminar: tiene ${saleCount} venta(s) registrada(s). Solo puedes desactivarlo.`);
    e.status = 400; throw e;
  }
  const method = await PaymentMethod.findByPk(id);
  if (!method) { const e = new Error("Método de pago no encontrado"); e.status = 404; throw e; }
  const jcount = await PaymentJournal.count({ where: { type: method.code } });
  if (jcount > 0) {
    const e = new Error(`No se puede eliminar: ${jcount} diario(s) usan este método. Cámbialos primero.`);
    e.status = 400; throw e;
  }
  await method.destroy();
  return { message: "Método de pago eliminado" };
}

async function toggleMethod(id) {
  const method = await PaymentMethod.findByPk(id);
  if (!method) { const e = new Error("Método no encontrado"); e.status = 404; throw e; }
  await method.update({ active: !method.active });
  return { data: method };
}

module.exports = { getAllBanks, createBank, updateBank, deleteBank, toggleBank, getAllMethods, createMethod, updateMethod, deleteMethod, toggleMethod };
