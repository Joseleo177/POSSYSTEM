'use strict';

const {
  sequelize, Sequelize, Op, FabricationStage, fail, r4, money, text, companyOf, inTransaction,
} = require("./shared");

const QT = Sequelize.QueryTypes;

// Las de un taller típico de metalmecánica, para no empezar en blanco. Cada empresa las
// renombra, reordena o borra.
const PRESETS = ["Corte", "Doblez", "Soldadura", "Pulido", "Empaque"];

async function listStages(req, { all } = {}) {
  const company = companyOf(req);
  const rows = await sequelize.query(`
    SELECT s.id, s.name, s.position, s.cost_per_hour::float AS cost_per_hour, s.active,
           (SELECT COUNT(*) FROM fabrication_orders o
             WHERE o.current_stage_id = s.id AND o.status = 'abierta')::int AS open_orders
      FROM fabrication_stages s
     WHERE s.company_id = :company ${all === "true" || all === true ? "" : "AND s.active = true"}
     ORDER BY s.position, s.id`, { replacements: { company }, type: QT.SELECT });
  return { data: rows };
}

async function saveStage(req, body = {}) {
  const company = companyOf(req);
  const name = text(body.name, 60);
  if (!name) throw fail("Escribe el nombre de la etapa");
  const cost = money(body.cost_per_hour, "Costo por hora") ?? 0;

  return inTransaction(async (transaction) => {
    const dup = await FabricationStage.findOne({
      where: {
        company_id: company,
        [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("name")), name.toLowerCase())],
        ...(body.id ? { id: { [Op.ne]: parseInt(body.id) || 0 } } : {}),
      },
      transaction,
    });
    if (dup) throw fail(`Ya existe la etapa "${dup.name}"`);

    if (body.id) {
      const stage = await FabricationStage.findOne({ where: { id: parseInt(body.id) || 0, company_id: company }, transaction, lock: true });
      if (!stage) throw fail("Etapa no encontrada", 404);
      const changes = { name, cost_per_hour: r4(cost) };
      if (body.active !== undefined) {
        const active = body.active === true || body.active === "true";
        if (!active) {
          const [{ n }] = await sequelize.query(
            `SELECT COUNT(*)::int AS n FROM fabrication_orders WHERE current_stage_id = :id AND status = 'abierta'`,
            { replacements: { id: stage.id }, type: QT.SELECT, transaction });
          if (n) throw fail(`Hay ${n} orden(es) en "${stage.name}": muévelas antes de desactivarla`);
        }
        changes.active = active;
      }
      await stage.update(changes, { transaction });
      return { data: stage.toJSON() };
    }

    const max = await FabricationStage.max("position", { where: { company_id: company }, transaction });
    const stage = await FabricationStage.create({
      company_id: company, name, cost_per_hour: r4(cost), position: (parseInt(max) || 0) + 1,
    }, { transaction });
    return { data: stage.toJSON() };
  });
}

// Nuevo orden de las columnas: la lista completa de ids, en el orden deseado.
async function reorderStages(req, { ids } = {}) {
  const company = companyOf(req);
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw fail("Orden no válido");
  return inTransaction(async (transaction) => {
    const own = await FabricationStage.findAll({ where: { company_id: company }, attributes: ["id"], transaction });
    const ownIds = new Set(own.map(s => s.id));
    const clean = ids.map(i => parseInt(i)).filter(i => ownIds.has(i));
    for (let i = 0; i < clean.length; i++) {
      await FabricationStage.update({ position: i + 1 }, { where: { id: clean[i], company_id: company }, transaction });
    }
    return { ok: true };
  });
}

// Borrar solo lo que nunca se usó; lo usado se desactiva, para no romper el historial.
async function deleteStage(req, id) {
  const company = companyOf(req);
  return inTransaction(async (transaction) => {
    const stage = await FabricationStage.findOne({ where: { id: parseInt(id) || 0, company_id: company }, transaction, lock: true });
    if (!stage) throw fail("Etapa no encontrada", 404);
    const [{ n }] = await sequelize.query(`
      SELECT (SELECT COUNT(*) FROM fabrication_order_stages WHERE stage_id = :id)
           + (SELECT COUNT(*) FROM fabrication_recipe_items WHERE stage_id = :id)
           + (SELECT COUNT(*) FROM fabrication_order_plan WHERE stage_id = :id)
           + (SELECT COUNT(*) FROM fabrication_orders WHERE current_stage_id = :id) AS n`,
      { replacements: { id: stage.id }, type: QT.SELECT, transaction });
    if (parseInt(n)) throw fail(`"${stage.name}" ya se usó en recetas u órdenes: desactívala en vez de borrarla`);
    await stage.destroy({ transaction });
    return { ok: true };
  });
}

async function createPresetStages(req) {
  const company = companyOf(req);
  await inTransaction(async (transaction) => {
    const count = await FabricationStage.count({ where: { company_id: company }, transaction });
    if (count) throw fail("La empresa ya tiene etapas");
    for (let i = 0; i < PRESETS.length; i++) {
      await FabricationStage.create({ company_id: company, name: PRESETS[i], position: i + 1 }, { transaction });
    }
  });
  return listStages(req);
}

module.exports = { listStages, saveStage, reorderStages, deleteStage, createPresetStages };
