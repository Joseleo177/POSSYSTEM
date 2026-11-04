'use strict';

const {
  sequelize, AgendaResource, AgendaHour, AgendaBlock, AgendaResourceService, Product, Seller, Employee,
} = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { fail, int, q, alcance, recurso, instante, dia } = require("./shared");
const { olvidar } = require("../../utils/huella");

// Configuración de la agenda: profesionales y puestos, su horario semanal, sus ausencias y los
// servicios que se agendan (con su duración).

const COLOR = /^#[0-9a-f]{6}$/i;

/** Recursos de una sucursal con su horario. Los inactivos, solo con `all`. */
async function listar(req, warehouseId, { all = false } = {}) {
  const propios = await alcance(req, warehouseId);
  const recursos = await q(`
    SELECT r.id, r.warehouse_id, r.kind, r.name, r.capacity, r.seller_id, r.employee_id, r.color,
           r.sort_order, r.active, s.name AS seller_name, e.full_name AS employee_name
      FROM agenda_resources r
      LEFT JOIN sellers s ON s.id = r.seller_id
      LEFT JOIN employees e ON e.id = r.employee_id
     WHERE r.company_id = :cid AND r.warehouse_id = :wid ${all ? "" : "AND r.active"}
       ${propios ? "AND r.id IN (:propios)" : ""}
     ORDER BY r.active DESC, r.sort_order, r.id`, { cid: req.company_id, wid: warehouseId, propios });
  if (!recursos.length) return [];

  const ids = recursos.map(r => r.id);
  const horas = await q(`SELECT resource_id, weekday, start_min, end_min FROM agenda_hours
    WHERE company_id = :cid AND resource_id IN (:ids) ORDER BY weekday, start_min`, { cid: req.company_id, ids });
  return recursos.map(r => ({
    ...r,
    hours: horas.filter(h => h.resource_id === r.id).map(({ resource_id, ...h }) => h), // eslint-disable-line no-unused-vars
  }));
}

/** Crea o edita un recurso. body: { warehouse_id, kind, name, capacity, seller_id, employee_id, color, active } */
async function guardar(req, id, body = {}) {
  const nombre = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!nombre) throw fail("Ponle nombre");
  const kind = body.kind === "puesto" ? "puesto" : "persona";
  // Una persona atiende de a una cita; solo un puesto tiene varias bahías.
  const capacity = kind === "persona" ? 1 : int(body.capacity);
  if (!(capacity >= 1 && capacity <= 50)) throw fail("La capacidad va de 1 a 50");
  const color = COLOR.test(String(body.color || "")) ? String(body.color).toLowerCase() : null;

  const sellerId = body.seller_id ? int(body.seller_id) : null;
  if (sellerId && !(await Seller.findOne({ where: { id: sellerId }, attributes: ["id"] }))) throw fail("Ese vendedor no existe");
  const employeeId = body.employee_id ? int(body.employee_id) : null;
  if (employeeId && !(await Employee.findOne({ where: { id: employeeId }, attributes: ["id"] }))) throw fail("Ese usuario no existe");

  const datos = {
    kind, name: nombre, capacity, color, seller_id: sellerId, employee_id: employeeId,
    sort_order: Number.isInteger(int(body.sort_order)) ? int(body.sort_order) : 0,
  };

  if (id) {
    const r = await AgendaResource.findOne({ where: { id: int(id) } });
    if (!r) throw fail("No encontrado", 404);
    await assertWarehouseAccess(req, r.warehouse_id);
    if (body.active === false) {
      // Desactivar con citas por delante las dejaría sin quien las atienda.
      const [fut] = await q(`SELECT COUNT(*)::int AS n FROM appointments
        WHERE company_id = :cid AND resource_id = :id AND starts_at > NOW() AND status IN ('pendiente', 'confirmada')`,
      { cid: req.company_id, id: r.id });
      if (fut.n) throw fail(`Tiene ${fut.n} cita${fut.n === 1 ? "" : "s"} por delante: muévelas o cancélalas antes`, 409);
    }
    await r.update({ ...datos, active: body.active === undefined ? r.active : !!body.active });
    olvidar(`agenda:${r.warehouse_id}`);
    return r.toJSON();
  }

  const wid = int(body.warehouse_id);
  if (!wid) throw fail("Elige la sucursal");
  await assertWarehouseAccess(req, wid);
  const creado = await sequelize.transaction(async (transaction) => {
    const r = await AgendaResource.create({ ...datos, warehouse_id: wid }, { transaction });
    // Nace con un horario de lunes a sábado de 9 a 6 para que se pueda agendar de una vez; se
    // ajusta en su ficha.
    await AgendaHour.bulkCreate([1, 2, 3, 4, 5, 6].map(weekday => ({ resource_id: r.id, weekday, start_min: 540, end_min: 1080 })), { transaction });
    return r;
  });
  olvidar(`agenda:${wid}`);
  return creado.toJSON();
}

/**
 * Reemplaza el horario semanal. hours: [{ weekday, start_min, end_min }]. Las franjas de un mismo
 * día no se pueden pisar.
 */
async function guardarHorario(req, id, hours) {
  const r = await recurso(id);
  await assertWarehouseAccess(req, r.warehouse_id);
  const lista = (Array.isArray(hours) ? hours : []).map(h => ({ weekday: int(h.weekday), start_min: int(h.start_min), end_min: int(h.end_min) }));
  if (lista.length > 50) throw fail("Demasiadas franjas");
  for (const h of lista) {
    if (!(h.weekday >= 0 && h.weekday <= 6)) throw fail("Día no válido");
    if (!(h.start_min >= 0 && h.end_min <= 1440 && h.end_min > h.start_min)) throw fail("Cada franja debe terminar después de empezar");
  }
  for (let d = 0; d < 7; d++) {
    const del = lista.filter(h => h.weekday === d).sort((a, b) => a.start_min - b.start_min);
    for (let i = 1; i < del.length; i++) if (del[i].start_min < del[i - 1].end_min) throw fail("Dos franjas del mismo día se pisan");
  }
  await sequelize.transaction(async (transaction) => {
    await AgendaHour.destroy({ where: { resource_id: r.id }, transaction });
    if (lista.length) await AgendaHour.bulkCreate(lista.map(h => ({ ...h, resource_id: r.id })), { transaction });
  });
  olvidar(`agenda:${r.warehouse_id}`);
  return { resource_id: r.id, hours: lista };
}

/** Ausencias de un recurso desde hoy. */
async function listarAusencias(req, id) {
  const r = await recurso(id);
  await alcance(req, r.warehouse_id);
  return q(`SELECT id, starts_at, ends_at, reason FROM agenda_blocks
    WHERE company_id = :cid AND resource_id = :id AND ends_at > NOW() ORDER BY starts_at`, { cid: req.company_id, id: r.id });
}

/**
 * Ausencia: un día entero (from = to, sin horas) o un rato. body: { from, to, start_min?, end_min?, reason }
 * Las citas que caen dentro no se tocan: se avisan para que se muevan.
 */
async function crearAusencia(req, id, body = {}) {
  const r = await recurso(id);
  await assertWarehouseAccess(req, r.warehouse_id);
  const desdeF = String(body.from || ""), hastaF = String(body.to || body.from || "");
  dia(desdeF); dia(hastaF);
  const sm = body.start_min == null || body.start_min === "" ? 0 : int(body.start_min);
  const em = body.end_min == null || body.end_min === "" ? 1440 : int(body.end_min);
  if (!(sm >= 0 && em <= 1440)) throw fail("Hora no válida");
  const starts = instante(desdeF, sm);
  const ends = em === 1440 ? instante(hastaF, 0) : instante(hastaF, em);
  const fin = em === 1440 ? new Date(ends.getTime() + 86400000) : ends;
  if (!(fin > starts)) throw fail("La ausencia debe terminar después de empezar");
  if (fin - starts > 366 * 86400000) throw fail("Una ausencia no puede pasar de un año");

  const b = await AgendaBlock.create({
    resource_id: r.id, starts_at: starts, ends_at: fin,
    reason: String(body.reason || "").trim().slice(0, 120) || null,
  });
  const [choques] = await q(`SELECT COUNT(*)::int AS n FROM appointments
    WHERE company_id = :cid AND resource_id = :id AND status IN ('pendiente', 'confirmada')
      AND starts_at < :fin AND ends_at > :ini`, { cid: req.company_id, id: r.id, ini: starts, fin });
  olvidar(`agenda:${r.warehouse_id}`);
  return { ...b.toJSON(), citas_afectadas: choques.n };
}

async function borrarAusencia(req, blockId) {
  const b = await AgendaBlock.findOne({ where: { id: int(blockId) } });
  if (!b) throw fail("No encontrada", 404);
  const r = await AgendaResource.findOne({ where: { id: b.resource_id } });
  await assertWarehouseAccess(req, r?.warehouse_id);
  await b.destroy();
  olvidar(`agenda:${r.warehouse_id}`);
  return { id: b.id };
}

/**
 * Servicios que se pueden agendar en una sucursal: los productos con duración, con el precio de
 * la sucursal y quiénes los hacen (resource_ids vacío = todos). `all` trae también los
 * servicios que todavía no tienen duración, para configurarlos.
 */
async function listarServicios(req, warehouseId, { all = false } = {}) {
  await alcance(req, warehouseId);
  return q(`
    SELECT p.id, p.name, p.duration_min, COALESCE(ps.price, p.price)::float AS price, p.category_id, c.name AS category_name,
           ARRAY(SELECT rs.resource_id FROM agenda_resource_services rs
                   JOIN agenda_resources r ON r.id = rs.resource_id
                  WHERE rs.product_id = p.id AND r.warehouse_id = :wid AND r.active
                  ORDER BY rs.resource_id) AS resource_ids
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
     WHERE p.company_id = :cid AND p.sellable AND NOT p.is_variant_parent
       AND ${all ? "(p.is_service OR p.duration_min IS NOT NULL)" : "p.duration_min IS NOT NULL"}
     ORDER BY p.duration_min IS NULL, c.name NULLS LAST, p.name
     LIMIT 2000`, { cid: req.company_id, wid: warehouseId });
}

/**
 * Duración de un servicio y quiénes lo hacen. body: { duration_min (null = no se agenda),
 * resource_ids?: [] }. resource_ids vacío = lo hacen todos.
 */
async function guardarServicio(req, productId, body = {}) {
  const p = await Product.findOne({ where: { id: int(productId) }, attributes: ["id", "name", "is_service", "duration_min"] });
  if (!p) throw fail("Ese servicio no existe", 404);
  const dur = body.duration_min == null || body.duration_min === "" ? null : int(body.duration_min);
  if (dur !== null && !(dur >= 5 && dur <= 720)) throw fail("La duración va de 5 minutos a 12 horas");

  await sequelize.transaction(async (transaction) => {
    await p.update({ duration_min: dur }, { transaction });
    if (Array.isArray(body.resource_ids) && body.warehouse_id) {
      const wid = int(body.warehouse_id);
      await assertWarehouseAccess(req, wid);
      const deSucursal = (await AgendaResource.findAll({ where: { warehouse_id: wid }, attributes: ["id"], transaction, raw: true })).map(r => r.id);
      const elegidos = body.resource_ids.map(int).filter(id => deSucursal.includes(id));
      // Solo se reescribe lo de esta sucursal: el mismo servicio puede tener otros
      // profesionales en otra.
      if (deSucursal.length) {
        await AgendaResourceService.destroy({ where: { product_id: p.id, resource_id: deSucursal }, transaction });
      }
      if (elegidos.length) {
        await AgendaResourceService.bulkCreate(elegidos.map(resource_id => ({ resource_id, product_id: p.id })), { transaction });
      }
      olvidar(`agenda:${wid}`);
    }
  });
  return { id: p.id, duration_min: dur };
}

module.exports = { listar, guardar, guardarHorario, listarAusencias, crearAusencia, borrarAusencia, listarServicios, guardarServicio };
