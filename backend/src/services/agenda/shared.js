'use strict';

const { sequelize, Sequelize, AgendaResource } = require("../../models");
const { hasPermission, scopeWarehouseIds, assertWarehouseAccess } = require("../../middleware/auth");
const { zonedInstant, TIMEZONE } = require("../../utils/localDate");

// Agenda de citas (ver migración 20261107100000-agenda).
//
// Las horas de la agenda son horas de pared de la sucursal ("el martes a las 3:30"), no
// instantes: todo pasa por la zona de operación (utils/localDate), nunca por la del proceso,
// que en Vercel es UTC.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => (Number.isInteger(Number(v)) && v !== null && v !== "" ? Number(v) : NaN);

// Citas que ocupan su hueco. "Terminada" sigue ocupándolo: el barbero estuvo ahí.
const OCUPAN = ["pendiente", "confirmada", "en_curso", "terminada"];
const OCUPAN_SQL = OCUPAN.map(s => `'${s}'`).join(", ");

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → { y, m, d, weekday } (0 = domingo). Lanza si no es una fecha. */
function dia(fecha) {
  const m = DIA.exec(String(fecha || "").trim());
  if (!m) throw fail("Fecha no válida");
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  if (utc.getUTCMonth() !== mo - 1) throw fail("Fecha no válida");
  return { y, m: mo, d, weekday: utc.getUTCDay() };
}

/** Instante de los `min` minutos del día `fecha` en la sucursal (9:30 = 570). */
function instante(fecha, min) {
  const { y, m, d } = dia(fecha);
  return zonedInstant(y, m, d, Math.floor(min / 60), min % 60);
}

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Instante → { fecha: 'YYYY-MM-DD', min } en la hora de la sucursal. */
function partes(instant) {
  const p = Object.fromEntries(partesFmt.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}

const hoy = () => partes(new Date()).fecha;

/** Suma días a 'YYYY-MM-DD'. */
function masDias(fecha, n) {
  const { y, m, d } = dia(fecha);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const q = (sql, replacements, opts = {}) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT, ...opts });

const puede = (req, perm) => hasPermission(req.employee?.permissions, perm);

/**
 * Recursos de la empresa enlazados a quien pide (su usuario es el barbero). Ese barbero ve y
 * atiende sus citas aunque no tenga los permisos de la agenda.
 */
async function recursosPropios(req) {
  if (!req.employee?.id) return [];
  if (req._agendaPropios) return req._agendaPropios;
  const filas = await AgendaResource.findAll({ where: { employee_id: req.employee.id, active: true }, attributes: ["id", "warehouse_id"], raw: true });
  req._agendaPropios = filas;
  return filas;
}

/**
 * Qué parte de la agenda ve quien pide, en una sucursal: `null` = toda (agenda.view o
 * agenda.book), o la lista de SUS recursos. Lanza si no ve nada.
 */
async function alcance(req, warehouseId) {
  if (puede(req, "agenda.view") || puede(req, "agenda.book") || puede(req, "agenda.setup")) {
    await assertWarehouseAccess(req, warehouseId);
    return null;
  }
  const propios = (await recursosPropios(req)).filter(r => r.warehouse_id === warehouseId).map(r => r.id);
  if (!propios.length) throw fail("No tienes agenda en esta sucursal", 403);
  return propios;
}

/** Sucursal pedida, o la primera visible. */
async function sucursalDe(req, warehouseId) {
  const wid = int(warehouseId);
  if (wid) return wid;
  const visibles = await scopeWarehouseIds(req);
  if (Array.isArray(visibles)) {
    if (!visibles.length) throw fail("No tienes sucursales asignadas", 403);
    return visibles[0];
  }
  const [w] = await q(`SELECT id FROM warehouses WHERE company_id = :cid AND sells IS NOT FALSE ORDER BY id LIMIT 1`, { cid: req.company_id });
  if (!w) throw fail("La empresa no tiene sucursales");
  return w.id;
}

/** Recurso activo de la empresa, o 404. */
async function recurso(id, transaction, lock = false) {
  const r = await AgendaResource.findOne({ where: { id: int(id), active: true }, transaction, ...(lock ? { lock: true } : {}) });
  if (!r) throw fail("Ese profesional o puesto ya no está en la agenda", 404);
  return r;
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

module.exports = {
  fail, int, OCUPAN, OCUPAN_SQL, dia, instante, partes, hoy, masDias, q, puede,
  recursosPropios, alcance, sucursalDe, recurso, hhmm,
};
