'use strict';

const recursos = require("./recursos");
const citas = require("./citas");
const { prepararCobro } = require("./cobro");
const { huecos, pasoDe, STEP_KEY, PASOS } = require("./disponibilidad");
const { fail, int, q, dia, instante, alcance, sucursalDe, puede } = require("./shared");
const { huella } = require("../../utils/huella");
const { Setting } = require("../../models");

// Agenda de citas: ver migración 20261107100000-agenda.

/**
 * El día de la sucursal para la pantalla: recursos, citas y paso. La pantalla lo pide cada pocos
 * segundos con la huella de lo que ya tiene (?v=); si nada cambió responde { unchanged } con una
 * sola consulta (ver utils/huella).
 */
async function dia_(req, { warehouse_id, date, v }) {
  const wid = await sucursalDe(req, warehouse_id);
  dia(date);
  const propios = await alcance(req, wid);
  const ini = instante(date, 0);
  const fin = new Date(ini.getTime() + 86400000);
  const actual = await huella(`agenda:${wid}:${date}:${propios ? propios.join(".") : "todo"}`, `
    SELECT md5(
      COALESCE((SELECT string_agg(a.id || ':' || a.status || ':' || a.resource_id || ':' || extract(epoch FROM a.updated_at) || ':' || COALESCE(s.status, ''), ',' ORDER BY a.id)
                  FROM appointments a LEFT JOIN sales s ON s.id = a.sale_id
                 WHERE a.company_id = :cid AND a.warehouse_id = :wid AND a.starts_at < :fin AND a.ends_at > :ini), '')
      || '|' || (SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM agenda_resources WHERE company_id = :cid AND warehouse_id = :wid AND active)
      || '|' || (SELECT COUNT(*) || ':' || COALESCE(MAX(b.id), 0) FROM agenda_blocks b JOIN agenda_resources r ON r.id = b.resource_id
                  WHERE b.company_id = :cid AND r.warehouse_id = :wid AND b.starts_at < :fin AND b.ends_at > :ini)
      || '|' || (SELECT COUNT(*) FROM appointments a JOIN sales s ON s.id = a.sale_id
                  WHERE a.company_id = :cid AND a.warehouse_id = :wid AND a.status = 'terminada' AND s.status IN ('espera', 'borrador'))
    ) AS v`, { cid: req.company_id, wid, ini, fin }, 3000);
  if (v && v === actual) return { unchanged: true, v: actual };

  const [lista, citasDia, porCobrar, paso, bloqueos] = await Promise.all([
    recursos.listar(req, wid),
    citas.listarDia(req, wid, date),
    citas.porCobrar(req, wid),
    pasoDe(req.company_id),
    q(`SELECT b.id, b.resource_id, b.starts_at, b.ends_at, b.reason FROM agenda_blocks b
         JOIN agenda_resources r ON r.id = b.resource_id
        WHERE b.company_id = :cid AND r.warehouse_id = :wid AND b.starts_at < :fin AND b.ends_at > :ini
          ${propios ? "AND b.resource_id IN (:propios)" : ""}`, { cid: req.company_id, wid, ini, fin, propios }),
  ]);
  const aMin = (t) => Math.min(1440, Math.max(0, Math.round((new Date(t).getTime() - ini.getTime()) / 60000)));
  return {
    v: actual,
    data: {
      warehouse_id: wid,
      date,
      step: paso,
      // Lo que puede hacer quien mira: la pantalla dibuja los botones con esto.
      can: {
        book: puede(req, "agenda.book"),
        setup: puede(req, "agenda.setup"),
        charge: puede(req, "sales.create"),
        all: !propios,
      },
      resources: lista,
      appointments: citasDia,
      blocks: bloqueos.map(b => ({ ...b, start_min: aMin(b.starts_at), end_min: aMin(b.ends_at) })),
      to_charge: porCobrar,
    },
  };
}

/** Horas libres. query: warehouse_id, date, product_ids ("3,7"), resource_id, exclude */
async function slots(req, query) {
  const wid = await sucursalDe(req, query.warehouse_id);
  const propios = await alcance(req, wid);
  let soloIds = query.resource_id ? [int(query.resource_id)] : null;
  if (propios) soloIds = soloIds ? soloIds.filter(id => propios.includes(id)) : propios;
  if (soloIds && !soloIds.length) throw fail("Solo puedes ver tu agenda", 403);
  const productIds = String(query.product_ids || "").split(",").map(int).filter(n => n > 0);
  return huecos(req.company_id, { warehouseId: wid, fecha: String(query.date || ""), productIds, soloIds, excluir: int(query.exclude) || null });
}

async function leerAjustes(req) {
  const { ajustes } = require("./publico");
  const web = await ajustes(req.company_id);
  return { step_min: await pasoDe(req.company_id), steps: PASOS, web_mode: web.modo, web_days: web.dias };
}

/** body: { step_min?, web_mode? ('off' | 'pendiente' | 'confirmada'), web_days? } — solo lo que venga. */
async function guardarAjustes(req, body = {}) {
  const { MODOS } = require("./publico");
  const guardar = (key, value) => Setting.upsert({ key, value: String(value), company_id: req.company_id });
  if (body.step_min !== undefined) {
    const paso = int(body.step_min);
    if (!PASOS.includes(paso)) throw fail(`El intervalo puede ser ${PASOS.join(", ")} minutos`);
    await guardar(STEP_KEY, paso);
  }
  if (body.web_mode !== undefined) {
    if (!MODOS.includes(body.web_mode)) throw fail("Modo de reservas no válido");
    await guardar("agenda_web", body.web_mode);
  }
  if (body.web_days !== undefined) {
    const d = int(body.web_days);
    if (!(d >= 1 && d <= 90)) throw fail("Las reservas van de 1 a 90 días por delante");
    await guardar("agenda_web_days", d);
  }
  return leerAjustes(req);
}

/**
 * Productos para sumar al terminar una cita (la cera, el aceite de barba), con el precio y la
 * existencia de la sucursal. Va aquí y no en el catálogo porque el barbero no tiene
 * products.view: solo necesita encontrar lo que vendió en el sillón.
 */
async function productos(req, { warehouse_id, search }) {
  const wid = await sucursalDe(req, warehouse_id);
  await alcance(req, wid);
  const texto = String(search || "").trim().slice(0, 60);
  return q(`
    SELECT p.id, p.name, p.unit, p.is_service, p.duration_min,
           COALESCE(ps.price, p.price)::float AS price, COALESCE(ps.qty, 0)::float AS stock
      FROM products p
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
     WHERE p.company_id = :cid AND p.sellable AND NOT p.is_variant_parent AND NOT p.is_addon
       AND (p.is_service OR p.is_combo OR COALESCE(ps.qty, 0) > 0)
       ${texto ? "AND (p.name ILIKE :like OR p.barcode = :texto)" : ""}
     ORDER BY p.duration_min IS NOT NULL, p.name
     LIMIT 40`, { cid: req.company_id, wid, like: `%${texto}%`, texto });
}

/**
 * Ubicación de la sucursal: el punto del mapa de la vitrina y de "Cómo llegar". Es la misma
 * columna que usa el delivery (warehouses.lat/lng); aquí se marca sin necesitar el extra de
 * pedidos web.
 */
async function leerUbicacion(req, warehouseId) {
  const wid = await sucursalDe(req, warehouseId);
  await alcance(req, wid);
  const [w] = await q(`SELECT id, name, lat::float AS lat, lng::float AS lng FROM warehouses WHERE company_id = :cid AND id = :wid`, { cid: req.company_id, wid });
  return w || null;
}

async function guardarUbicacion(req, body = {}) {
  const wid = await sucursalDe(req, body.warehouse_id);
  await alcance(req, wid);   // con agenda.setup comprueba que la sucursal sea suya
  const { saveWarehouseLocation } = require("../catalogCheckout");
  const r = await saveWarehouseLocation(req, wid, { lat: body.lat ?? null, lng: body.lng ?? null });
  return r.data;
}

/** Vendedores y usuarios para enlazar a un recurso. */
async function opcionesConfig(req) {
  const [vendedores, usuarios] = await Promise.all([
    q(`SELECT id, code, name FROM sellers WHERE company_id = :cid AND active ORDER BY code, name`, { cid: req.company_id }),
    q(`SELECT id, full_name AS name, username FROM employees WHERE company_id = :cid AND active ORDER BY full_name`, { cid: req.company_id }),
  ]);
  return { sellers: vendedores, employees: usuarios };
}

module.exports = {
  ...recursos,
  ...citas,
  prepararCobro,
  dia: dia_,
  slots,
  leerAjustes,
  guardarAjustes,
  opcionesConfig,
  productos,
  leerUbicacion,
  guardarUbicacion,
};
