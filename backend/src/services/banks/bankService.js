const { Sequelize, Bank, PaymentMethod, PaymentJournal, Sale } = require("../../models");
const { imageUrl, saveImage, deleteImage } = require("../../utils/imageStorage");

function wrapUnique(err, label) {
  if (err.name === "SequelizeUniqueConstraintError") {
    const e = new Error(`Ya existe ${label} con ese nombre`);
    e.status = 409; throw e;
  }
  throw err;
}

// Los campos que llegan por multipart (cuando viene el logo) son siempre texto: "true",
// "false", "3"… Se normalizan aquí para que el guardado sea idéntico venga por JSON o por
// formulario con archivo.
const asBool = (v, dflt) => v === undefined || v === null || v === ""
  ? dflt
  : (v === true || v === "true" || v === "1" || v === 1);
const asInt = (v, dflt = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
};
const wantsClear = (v) => v === true || v === "true";

// Lo que se guarda en la base (nombre de archivo local o URL de Supabase) a lo que el
// navegador puede pedir.
const withUrl = (row) => {
  if (!row) return row;
  const j = typeof row.toJSON === "function" ? row.toJSON() : row;
  return { ...j, image_url: imageUrl(j.image_filename) };
};

async function getAllBanks() {
  const banks = await Bank.findAll({
    attributes: { include: [[Sequelize.fn("COUNT", Sequelize.col("PaymentJournals.id")), "journals_count"]] },
    include: [{ model: PaymentJournal, attributes: [] }],
    group: ["Bank.id"],
    order: [["sort_order", "ASC"], ["name", "ASC"]],
    raw: true,
  });
  banks.forEach(b => b.journals_count = parseInt(b.journals_count || 0));
  return { data: banks.map(withUrl) };
}

async function createBank({ name, code, sort_order = 0 }, file = null, companyId = null) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  try {
    const image_filename = file ? await saveImage(file, "bank") : null;
    const bank = await Bank.create({
      name: name.trim(),
      code: code?.trim() || null,
      sort_order: asInt(sort_order),
      image_filename,
      company_id: companyId,
    });
    return { data: withUrl(bank) };
  } catch (err) { wrapUnique(err, "un banco"); }
}

async function updateBank(id, { name, code, active, sort_order, clear_image }, file = null, companyId = null) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const where = companyId ? { id, company_id: companyId } : { id };
  const bank = await Bank.findOne({ where });
  if (!bank) { const e = new Error("Banco no encontrado"); e.status = 404; throw e; }
  try {
    const patch = {
      name: name.trim(),
      code: code?.trim() || null,
      active: asBool(active, true),
      sort_order: asInt(sort_order),
    };
    if (file) {
      const old = bank.image_filename;
      patch.image_filename = await saveImage(file, "bank");
      await deleteImage(old);
    } else if (wantsClear(clear_image)) {
      await deleteImage(bank.image_filename);
      patch.image_filename = null;
    }
    await bank.update(patch);
    return { data: withUrl(bank) };
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
  const image = bank.image_filename;
  await bank.destroy();
  await deleteImage(image);
  return { message: "Banco eliminado" };
}

async function toggleBank(id) {
  const bank = await Bank.findByPk(id);
  if (!bank) { const e = new Error("Banco no encontrado"); e.status = 404; throw e; }
  await bank.update({ active: !bank.active });
  return { data: withUrl(bank) };
}

async function getAllMethods() {
  const methods = await PaymentMethod.findAll({
    order: [["sort_order", "ASC"], ["name", "ASC"]],
    raw: true,
  });
  return { data: methods.map(withUrl) };
}

async function createMethod({ name, code, color = "#555555", sort_order = 0, allows_outflow = true }, file = null, companyId = null) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  if (!code?.trim()) { const e = new Error("El código es requerido"); e.status = 400; throw e; }
  const normalizedCode = code.trim().toLowerCase().replace(/\s+/g, "_");
  try {
    const image_filename = file ? await saveImage(file, "method") : null;
    const method = await PaymentMethod.create({
      name: name.trim(),
      code: normalizedCode,
      color: color || "#555555",
      sort_order: asInt(sort_order),
      allows_outflow: asBool(allows_outflow, true),
      image_filename,
      company_id: companyId,
    });
    return { data: withUrl(method) };
  } catch (err) { wrapUnique(err, "un método"); }
}

async function updateMethod(id, { name, color, active, sort_order, allows_outflow, clear_image }, file = null, companyId = null) {
  if (!name?.trim()) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const where = companyId ? { id, company_id: companyId } : { id };
  const method = await PaymentMethod.findOne({ where });
  if (!method) { const e = new Error("Método de pago no encontrado"); e.status = 404; throw e; }
  try {
    const patch = {
      name: name.trim(),
      color: color || "#555555",
      active: asBool(active, true),
      sort_order: asInt(sort_order),
      allows_outflow: asBool(allows_outflow, true),
    };
    if (file) {
      const old = method.image_filename;
      patch.image_filename = await saveImage(file, "method");
      await deleteImage(old);
    } else if (wantsClear(clear_image)) {
      await deleteImage(method.image_filename);
      patch.image_filename = null;
    }
    await method.update(patch);
    return { data: withUrl(method) };
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
  const image = method.image_filename;
  await method.destroy();
  await deleteImage(image);
  return { message: "Método de pago eliminado" };
}

async function toggleMethod(id) {
  const method = await PaymentMethod.findByPk(id);
  if (!method) { const e = new Error("Método no encontrado"); e.status = 404; throw e; }
  await method.update({ active: !method.active });
  return { data: withUrl(method) };
}

module.exports = { getAllBanks, createBank, updateBank, deleteBank, toggleBank, getAllMethods, createMethod, updateMethod, deleteMethod, toggleMethod };
