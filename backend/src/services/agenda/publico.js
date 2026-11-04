'use strict';

const { Company, Setting, Warehouse, Customer } = require("../../models");
const { tenantStorage } = require("../../utils/tenantStorage");
const { fail, int, q, dia, hoy, masDias, partes } = require("./shared");
const { huecosGrupo, pasoDe } = require("./disponibilidad");
const { imageUrl } = require("../../utils/imageStorage");

// Reservas desde la vitrina (catálogo público): el cliente elige servicio, profesional, día y
// hora, y la cita entra a la agenda marcada como reservada en línea.
//
// No es otro camino: reservar llama a la misma crear() de la agenda interna, con el horario
// respetado y sin sobrecupo. Lo propio de aquí son los límites de quien no inició sesión:
// cuántos días por delante, con cuánta anticipación, y cuántas citas vivas puede tener un
// mismo teléfono.
//
// Ajustes (Agenda → Configuración → Ajustes):
//   agenda_web       off | pendiente | confirmada — apagado, la recepción confirma, o
//                    confirmada al instante. Apagado por defecto: es una decisión de la tienda.
//   agenda_web_days  hasta cuántos días por delante se puede reservar (30).
const MODOS = ["off", "pendiente", "confirmada"];
const ANTICIPACION_MIN = 30;    // no se reserva para dentro de menos de media hora
const MAX_POR_TELEFONO = 5;     // citas vivas por delante con el mismo teléfono (un grupo cuenta cada una)
const MAX_PERSONAS = 4;         // personas en una misma reserva (el papá y sus hijos)

async function ajustes(companyId) {
  const filas = await Setting.findAll({ where: { company_id: companyId, key: ["agenda_web", "agenda_web_days"] }, raw: true });
  const s = Object.fromEntries(filas.map(f => [f.key, f.value]));
  const modo = MODOS.includes(s.agenda_web) ? s.agenda_web : "off";
  const dias = Math.min(90, Math.max(1, int(s.agenda_web_days) || 30));
  return { modo, dias };
}

/** ¿La vitrina de esta empresa acepta reservas? Lo pregunta getStore. */
async function activa(companyId) {
  const c = await Company.findByPk(companyId, { attributes: ["citas_enabled"] });
  if (!c?.citas_enabled) return false;
  return (await ajustes(companyId)).modo !== "off";
}

// Quien reserva no tiene sesión: la agenda se consulta como un administrador de la empresa,
// dentro del filtro de la empresa (tenantStorage). Los límites del público van aquí, antes.
const reqDe = (companyId) => ({ company_id: companyId, employee: { id: null, permissions: { all: true } }, headers: {} });

async function sucursal(companyId, warehouseId) {
  const wid = int(warehouseId);
  const w = wid
    ? await Warehouse.findOne({ where: { id: wid, company_id: companyId, active: true, sells: true }, attributes: ["id"] })
    : await Warehouse.findOne({ where: { company_id: companyId, active: true, sells: true }, order: [["sort_order", "ASC"], ["id", "ASC"]], attributes: ["id"] });
  if (!w) throw fail("Esa sucursal no está disponible", 404);
  return w.id;
}

/**
 * Lo que la vitrina necesita para reservar en una sucursal: el equipo, los servicios con su
 * precio y duración, y las reglas (modo, días). null si no reserva.
 */
async function info(companyId, warehouseId) {
  if (!(await activa(companyId))) return null;
  return tenantStorage.run({ company_id: companyId }, async () => {
    const wid = await sucursal(companyId, warehouseId);
    const { modo, dias } = await ajustes(companyId);
    const [equipo, servicios, horas, paso, [lugar]] = await Promise.all([
      q(`SELECT id, name, kind, color FROM agenda_resources
          WHERE company_id = :cid AND warehouse_id = :wid AND active ORDER BY sort_order, id`, { cid: companyId, wid }),
      q(`SELECT p.id, p.name, p.short_description, p.duration_min, COALESCE(ps.price, p.price)::float AS price, p.image_filename, c.name AS category_name,
                ARRAY(SELECT rs.resource_id FROM agenda_resource_services rs JOIN agenda_resources r ON r.id = rs.resource_id
                       WHERE rs.product_id = p.id AND r.warehouse_id = :wid AND r.active ORDER BY rs.resource_id) AS resource_ids
           FROM products p
           LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
           LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.company_id = :cid AND p.sellable AND p.duration_min IS NOT NULL AND p.visible_in_catalog
          ORDER BY c.name NULLS LAST, p.name LIMIT 1000`, { cid: companyId, wid }),
      // Horario de la sucursal para el pie de la vitrina: la unión de los de su equipo.
      q(`SELECT h.weekday, MIN(h.start_min) AS desde, MAX(h.end_min) AS hasta
           FROM agenda_hours h JOIN agenda_resources r ON r.id = h.resource_id
          WHERE h.company_id = :cid AND r.warehouse_id = :wid AND r.active
          GROUP BY h.weekday ORDER BY h.weekday`, { cid: companyId, wid }),
      pasoDe(companyId),
      q(`SELECT lat::float AS lat, lng::float AS lng FROM warehouses WHERE id = :wid`, { wid }),
    ]);
    return {
      warehouse_id: wid,
      mode: modo,
      days_ahead: dias,
      today: hoy(),
      step: paso,
      team: equipo,
      services: servicios.map(({ image_filename, ...x }) => ({ ...x, image_url: imageUrl(image_filename) })),
      max_people: MAX_PERSONAS,
      // El punto del local para el mapa y "Cómo llegar". null = no está marcado.
      location: lugar?.lat != null && lugar?.lng != null ? { lat: lugar.lat, lng: lugar.lng } : null,
      hours: horas.map(h => ({ weekday: h.weekday, start_min: h.desde, end_min: h.hasta })),
    };
  });
}

// "3,7|12" → [[3, 7], [12]]: los servicios de cada persona del grupo.
const leerGrupos = (raw) => String(raw || "").split("|").slice(0, MAX_PERSONAS)
  .map(g => g.split(",").map(int).filter(n => n > 0).slice(0, 10)).filter(g => g.length);

/**
 * Horas libres de un día para la vitrina. query: warehouse_id, date, groups ("3,7|12": los
 * servicios de cada persona; o product_ids para una sola), mode (juntos | seguidos), resource_id.
 * → { date, step, durations, slots: [{ start, plan }] }
 */
async function slots(companyId, query = {}) {
  if (!(await activa(companyId))) throw fail("Esta tienda no recibe reservas en línea", 404);
  return tenantStorage.run({ company_id: companyId }, async () => {
    const wid = await sucursal(companyId, query.warehouse_id);
    const { dias } = await ajustes(companyId);
    const fecha = String(query.date || "");
    dia(fecha);
    if (fecha < hoy() || fecha > masDias(hoy(), dias)) return { date: fecha, resources: [] };
    const grupos = leerGrupos(query.groups || query.product_ids);
    if (!grupos.length) throw fail("Elige al menos un servicio");
    return huecosGrupo(companyId, {
      warehouseId: wid, fecha, grupos, modo: query.mode === "seguidos" ? "seguidos" : "juntos",
      soloIds: query.resource_id ? [int(query.resource_id)] : null,
      // Hoy, solo con la anticipación mínima.
      desde: fecha === hoy() ? partes(new Date()).min + ANTICIPACION_MIN : -1,
    });
  });
}

/**
 * Reserva. body: { warehouse_id, date, start_min, resource_id (vacío = cualquiera), name, phone,
 * document, notes, people: [{ name, product_ids }], mode (juntos | seguidos) }
 *
 * people: quiénes vienen. La primera persona es quien reserva (su nombre es `name`); las demás
 * llevan el suyo ("Mateo"). Sin people, una sola persona con body.product_ids.
 */
async function reservar(companyId, body = {}) {
  const { modo, dias } = await ajustes(companyId);
  const c = await Company.findByPk(companyId, { attributes: ["citas_enabled"] });
  if (!c?.citas_enabled || modo === "off") throw fail("Esta tienda no recibe reservas en línea", 404);

  const nombre = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (nombre.length < 2) throw fail("Escribe tu nombre");
  const telefono = String(body.phone || "").replace(/\D/g, "");
  if (telefono.length < 10 || telefono.length > 13) throw fail("Escribe un teléfono válido: te escribiremos ahí si hay algún cambio");

  const fecha = String(body.date || "");
  dia(fecha);
  if (fecha < hoy() || fecha > masDias(hoy(), dias)) throw fail(`Se reserva desde hoy y hasta ${dias} días por delante`);
  const ini = int(body.start_min);
  if (!(ini >= 0 && ini < 1440)) throw fail("Elige la hora");
  if (fecha === hoy() && ini < partes(new Date()).min + ANTICIPACION_MIN) {
    throw fail("Esa hora ya no se puede reservar: elige otra un poco más tarde", 409);
  }

  return tenantStorage.run({ company_id: companyId }, async () => {
    const wid = await sucursal(companyId, body.warehouse_id);

    const gente = (Array.isArray(body.people) && body.people.length ? body.people : [{ product_ids: body.product_ids }])
      .slice(0, MAX_PERSONAS + 1);
    if (gente.length > MAX_PERSONAS) throw fail(`Una reserva admite hasta ${MAX_PERSONAS} personas`);
    const grupos = gente.map(g => (Array.isArray(g.product_ids) ? g.product_ids : []).map(int).filter(n => n > 0).slice(0, 10));
    if (grupos.some(g => !g.length)) throw fail("Cada persona tiene que llevar al menos un servicio");
    const nombres = gente.map((g, i) => (i === 0 ? nombre : (String(g.name || "").trim().replace(/\s+/g, " ").slice(0, 80) || `Acompañante de ${nombre}`)));
    const forma = body.mode === "seguidos" ? "seguidos" : "juntos";

    // Un mismo teléfono no acapara la agenda: unas pocas citas vivas por delante.
    const [vivas] = await q(`SELECT COUNT(*)::int AS n FROM appointments
      WHERE company_id = :cid AND status IN ('pendiente', 'confirmada') AND starts_at > NOW()
        AND regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g') = :tel`, { cid: companyId, tel: telefono });
    if (vivas.n + gente.length > MAX_POR_TELEFONO) {
      throw fail("Ya tienes varias citas por delante con este teléfono. Escríbenos si necesitas otra.", 429);
    }

    // Con cédula:
    //  - si ya es cliente, se enlaza SOLO si el teléfono también es el suyo. La cédula sola no
    //    alcanza: es un dato que otro puede saber, y la cita saldría a nombre de ese cliente.
    //  - si no existe, se registra (como hace el pedido de la vitrina): así la próxima vez la
    //    vitrina lo reconoce y no vuelve a decirle "es tu primera vez".
    let customerId = null;
    const doc = String(body.document || "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^([VEJGP])(\d{6,9})$/);
    if (doc) {
      const [cli] = await q(`SELECT id, right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) AS tel10
          FROM customers WHERE company_id = :cid
           AND regexp_replace(upper(COALESCE(rif, '')), '[^A-Z0-9]', '', 'g') = :n
         LIMIT 1`, { cid: companyId, n: `${doc[1]}${doc[2]}` });
      if (cli) {
        customerId = cli.tel10 && cli.tel10 === telefono.slice(-10) ? cli.id : null;
      } else {
        try {
          const nuevo = await Customer.create({
            type: "cliente",
            name: nombre.toUpperCase(),
            phone: telefono,
            rif: `${doc[1]}-${doc[2]}`,
            company_id: companyId,
          });
          customerId = nuevo.id;
        } catch (err) {
          // Dos reservas a la vez con la misma cédula: el índice único se queda con una ficha.
          if (err?.name !== "SequelizeUniqueConstraintError") throw err;
        }
      }
    }

    // El plan de esa hora, calculado igual que cuando se ofreció. Si ya no está, se la ganó otro.
    const disponible = await huecosGrupo(companyId, {
      warehouseId: wid, fecha, grupos, modo: forma, soloIds: body.resource_id ? [int(body.resource_id)] : null,
    });
    const hueco = disponible.slots.find(x => x.start === ini);
    if (!hueco) throw Object.assign(fail("Esa hora ya no está libre: elige otra", 409), { code: "NO_CABE" });

    // Una cita por persona, cada una con quien le tocó en el plan. crear() vuelve a comprobar el
    // hueco con los recursos bloqueados; si una falla, las anteriores se cancelan: o se agenda
    // el grupo entero, o nada.
    const { crear, cambiarEstado } = require("./citas");
    const req = reqDe(companyId);
    const hechas = [];
    try {
      for (let i = 0; i < gente.length; i++) {
        hechas.push(await crear(req, {
          warehouse_id: wid,
          resource_id: hueco.plan[i].resource_id,
          date: fecha,
          start_min: hueco.plan[i].start,
          product_ids: grupos[i],
          customer_id: i === 0 ? customerId : null,
          customer_name: nombres[i],
          customer_phone: telefono,
          customer_doc: i === 0 && doc ? `${doc[1]}-${doc[2]}` : null,
          notes: [String(body.notes || "").trim(), gente.length > 1 ? `Viene con ${nombres.filter((_, j) => j !== i).join(", ")}` : ""].filter(Boolean).join(" · ").slice(0, 300) || null,
          // Confirmada al instante o por confirmar, según el ajuste de la tienda.
          status: modo,
        }, { source: "vitrina" }));
      }
    } catch (err) {
      for (const h of hechas) await cambiarEstado(req, h.id, "cancelada").catch(() => {});
      throw err;
    }

    const recursos = await q(`SELECT id, name FROM agenda_resources WHERE id IN (:ids)`, { ids: hechas.map(h => h.resource_id) });
    const nombreDe = (id) => recursos.find(r => r.id === id)?.name || null;
    return {
      status: hechas[0].status,
      date: fecha,
      mode: forma,
      appointments: hechas.map((c, i) => ({
        id: c.id,
        person: nombres[i],
        start_min: c.start_min,
        end_min: c.end_min,
        resource_name: nombreDe(c.resource_id),
        items: c.items.map(x => ({ name: x.name, duration_min: x.duration_min })),
      })),
    };
  });
}

module.exports = { activa, info, slots, reservar, ajustes, MODOS };
