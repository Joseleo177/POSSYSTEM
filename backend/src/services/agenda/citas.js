'use strict';

const { sequelize, Sequelize, Appointment, AppointmentItem, AgendaResource, Customer, Sale } = require("../../models");
const { fail, int, q, dia, instante, partes, hoy, puede, alcance, recurso, hhmm } = require("./shared");
const { MOTIVOS, cargarDia, motivoNoCabe, candidatos, servicios, pasoDe } = require("./disponibilidad");
const { olvidar } = require("../../utils/huella");

const { Op } = Sequelize;

// Citas de la agenda: darlas, moverlas, sus estados y terminarlas.
//
// Terminar una cita abre una cuenta EN ESPERA con createSale, igual que la ronda del mesonero
// (services/tables.js): precio de la sucursal, promociones, stock, comisión y correlativo salen
// del mismo camino de siempre. La cuenta se cobra después desde la agenda o desde el POS (ver
// cobro.js). La cita no guarda montos ni un estado "cobrada": eso se lee de la venta.

// A qué estado puede pasar cada uno con cambiarEstado. 'terminada' no está: se llega con
// terminar(), que abre la cuenta.
const PASOS = {
  pendiente:  ["confirmada", "en_curso", "cancelada", "no_asistio"],
  confirmada: ["pendiente", "en_curso", "cancelada", "no_asistio"],
  en_curso:   ["confirmada"],
  no_asistio: ["confirmada"],
  terminada:  [],
  cancelada:  [],
};

/** Cobro de la cita según su venta: por_cobrar, cobrada, debe o anulada. */
function estadoCobro(saleStatus) {
  if (!saleStatus) return null;
  if (["espera", "borrador"].includes(saleStatus)) return "por_cobrar";
  if (saleStatus === "anulado") return "anulada";
  if (["pendiente", "parcial"].includes(saleStatus)) return "debe";
  return "cobrada";
}

/** ¿Quien pide puede tocar las citas de este recurso? agenda.book, o es su barbero. */
function assertPuedeAtender(req, r) {
  if (puede(req, "agenda.book")) return;
  if (r.employee_id && r.employee_id === req.employee?.id) return;
  throw fail("Solo puedes atender tus propias citas", 403);
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const SELECT_CITA = `
  SELECT a.id, a.warehouse_id, a.resource_id, a.starts_at, a.ends_at, a.status, a.source,
         a.customer_id, COALESCE(c.name, a.customer_name) AS customer_name,
         COALESCE(a.customer_phone, c.phone) AS customer_phone, COALESCE(a.customer_doc, c.rif) AS customer_doc,
         a.notes, a.sale_id, a.created_at, s.status AS sale_status, s.total::float AS sale_total,
         s.invoice_number, s.employee_id AS sale_employee_id,
         COALESCE((SELECT json_agg(json_build_object('product_id', i.product_id, 'name', i.name, 'duration_min', i.duration_min) ORDER BY i.id)
                     FROM appointment_items i WHERE i.appointment_id = a.id), '[]') AS items
    FROM appointments a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN sales s ON s.id = a.sale_id`;

function formato(a) {
  const ini = partes(a.starts_at), fin = partes(a.ends_at);
  return {
    ...a,
    date: ini.fecha,
    start_min: ini.min,
    end_min: fin.fecha === ini.fecha ? fin.min : 1440,
    payment_state: estadoCobro(a.sale_status),
  };
}

/** Citas de un día de la sucursal (las que quien pide puede ver). */
async function listarDia(req, warehouseId, fecha) {
  dia(fecha);
  const propios = await alcance(req, warehouseId);
  const ini = instante(fecha, 0);
  const fin = new Date(ini.getTime() + 86400000);
  const filas = await q(`${SELECT_CITA}
     WHERE a.company_id = :cid AND a.warehouse_id = :wid AND a.starts_at < :fin AND a.ends_at > :ini
       ${propios ? "AND a.resource_id IN (:propios)" : ""}
     ORDER BY a.starts_at, a.id`, { cid: req.company_id, wid: warehouseId, ini, fin, propios });
  return filas.map(formato);
}

/**
 * Cuentas de citas terminadas que falta cobrar, de cualquier día: la lista de la recepción.
 */
async function porCobrar(req, warehouseId) {
  const propios = await alcance(req, warehouseId);
  const filas = await q(`${SELECT_CITA}
     WHERE a.company_id = :cid AND a.warehouse_id = :wid AND a.status = 'terminada'
       AND s.status IN ('espera', 'borrador')
       ${propios ? "AND a.resource_id IN (:propios)" : ""}
     ORDER BY a.ends_at`, { cid: req.company_id, wid: warehouseId, propios });
  return filas.map(formato);
}

async function una(req, id) {
  const [a] = await q(`${SELECT_CITA} WHERE a.company_id = :cid AND a.id = :id`, { cid: req.company_id, id: int(id) });
  if (!a) throw fail("Esa cita ya no existe", 404);
  return formato(a);
}

/** Historial de citas de un cliente (las últimas 30). */
async function deCliente(req, customerId) {
  const filas = await q(`${SELECT_CITA}
     WHERE a.company_id = :cid AND a.customer_id = :cus ORDER BY a.starts_at DESC LIMIT 30`,
  { cid: req.company_id, cus: int(customerId) });
  return filas.map(formato);
}

// ── Escritura ────────────────────────────────────────────────────────────────

/** Datos del cliente: uno registrado, o nombre y teléfono sueltos (el que llama por teléfono). */
async function datosCliente(body, transaction) {
  const cid = body.customer_id ? int(body.customer_id) : null;
  if (cid) {
    const c = await Customer.findOne({ where: { id: cid }, attributes: ["id"], transaction });
    if (!c) throw fail("Ese cliente no existe");
  }
  const nombre = String(body.customer_name || "").trim().replace(/\s+/g, " ").slice(0, 120) || null;
  if (!cid && !nombre) throw fail("Escribe el nombre del cliente o elígelo de la lista");
  return {
    customer_id: cid,
    customer_name: nombre,
    customer_phone: String(body.customer_phone || "").replace(/[^\d+]/g, "").slice(0, 30) || null,
    customer_doc: String(body.customer_doc || "").trim().toUpperCase().slice(0, 20) || null,
  };
}

/**
 * Elige el recurso y comprueba el hueco con los recursos BLOQUEADOS (FOR UPDATE), para que dos
 * personas no tomen la misma hora a la vez. Con resource_id vacío ("cualquiera") toma el que
 * tenga menos citas ese día entre los que pueden.
 *
 * Lanza 409 NO_CABE si no hay hueco; `forzar` lo salta (sobrecupo a sabiendas), salvo una
 * ausencia, que nunca se pisa.
 */
async function ubicar(req, { warehouseId, resourceId, fecha, ini, fin, productIds, excluir = null, forzar = false, horario = true }, transaction) {
  const soloIds = resourceId ? [int(resourceId)] : null;
  const opciones = await candidatos(req.company_id, warehouseId, productIds, { soloIds, transaction });
  if (!opciones.length) {
    throw fail(resourceId ? "Ese profesional no hace alguno de los servicios elegidos" : "Nadie en esta sucursal hace todos esos servicios");
  }
  // Bloqueo en orden de id: dos citas que bloquean los mismos recursos no se trancan entre sí.
  const ids = opciones.map(o => o.id).sort((a, b) => a - b);
  await AgendaResource.findAll({ where: { id: ids }, order: [["id", "ASC"]], lock: true, transaction, attributes: ["id"] });

  const mapa = await cargarDia(req.company_id, ids, fecha, { excluir, transaction });
  const motivos = [];
  const libres = [];
  for (const r of opciones) {
    const d = mapa.get(r.id);
    const motivo = motivoNoCabe(d, r.capacity, ini, fin, { horario });
    if (!motivo) libres.push({ r, carga: d.citas.length });
    else motivos.push({ r, motivo });
  }
  if (libres.length) {
    libres.sort((a, b) => a.carga - b.carga);
    return libres[0].r;
  }
  if (forzar) {
    // El sobrecupo no pisa una ausencia: el barbero no está.
    const posible = motivos.find(m => m.motivo !== "ausente");
    if (posible) return posible.r;
  }
  const m = motivos[0];
  const texto = resourceId
    ? `${m.r.name} está ${MOTIVOS[m.motivo]} a las ${hhmm(ini)}`
    : `No hay nadie libre a las ${hhmm(ini)}`;
  throw Object.assign(fail(texto, 409), { code: m.motivo === "ausente" ? "AUSENTE" : "NO_CABE" });
}

/**
 * Da una cita. body: { warehouse_id, resource_id (vacío = cualquiera), date, start_min,
 * product_ids, customer_id | customer_name, customer_phone, customer_doc, notes, status,
 * forzar }. `source` "vitrina" la marca como reservada por el cliente (ver publico.js).
 *
 * status 'en_curso' con start_min vacío es "atender ahora": el cliente que llega sin cita.
 */
async function crear(req, body = {}, { source = "interno" } = {}) {
  const wid = int(body.warehouse_id);
  if (!wid) throw fail("Elige la sucursal");
  await alcance(req, wid);

  const ahora = body.status === "en_curso" && (body.start_min == null || body.start_min === "");
  const fecha = ahora ? hoy() : String(body.date || "");
  dia(fecha);
  let ini = ahora ? Math.floor(partes(new Date()).min / 5) * 5 : int(body.start_min);
  if (!(ini >= 0 && ini < 1440)) throw fail("Elige la hora");

  // Quien no tiene agenda.book solo se agenda a sí mismo.
  let resourceId = body.resource_id ? int(body.resource_id) : null;
  if (!puede(req, "agenda.book")) {
    const propio = (await AgendaResource.findAll({ where: { employee_id: req.employee?.id || 0, warehouse_id: wid, active: true }, attributes: ["id"], raw: true })).map(r => r.id);
    if (!propio.length) throw fail("No tienes permiso para dar citas", 403);
    if (resourceId && !propio.includes(resourceId)) throw fail("Solo puedes darte citas a ti mismo", 403);
    resourceId = resourceId || propio[0];
  }

  const status = ["pendiente", "confirmada", "en_curso"].includes(body.status) ? body.status : "confirmada";
  if (!ahora && fecha < hoy() && status !== "en_curso") throw fail("Esa fecha ya pasó");

  const creada = await sequelize.transaction(async (transaction) => {
    const servs = await servicios(req.company_id, body.product_ids, transaction);
    const dur = servs.reduce((s, x) => s + x.duration_min, 0);
    const fin = ini + dur;
    if (fin > 1440) throw fail("La cita se pasaría de la medianoche");
    const cliente = await datosCliente(body, transaction);

    const r = await ubicar(req, {
      warehouseId: wid, resourceId, fecha, ini, fin, productIds: servs.map(s => s.id),
      // Atender ahora no mira el horario: el cliente ya está sentado.
      forzar: !!body.forzar, horario: !ahora,
    }, transaction);

    const cita = await Appointment.create({
      warehouse_id: wid, resource_id: r.id,
      starts_at: instante(fecha, ini), ends_at: instante(fecha, fin),
      status, source, ...cliente,
      notes: String(body.notes || "").trim().slice(0, 300) || null,
      created_by: req.employee?.id || null,
    }, { transaction });
    await AppointmentItem.bulkCreate(servs.map(s => ({ appointment_id: cita.id, product_id: s.id, name: s.name, duration_min: s.duration_min })), { transaction });
    return cita;
  });
  olvidar(`agenda:${wid}`);
  return una(req, creada.id);
}

/**
 * Mueve o edita una cita que todavía no empezó: hora, día, profesional, servicios, cliente o
 * nota. Solo lo que venga en el cuerpo.
 */
async function editar(req, id, body = {}) {
  const resultado = await sequelize.transaction(async (transaction) => {
    const cita = await Appointment.findOne({ where: { id: int(id) }, transaction, lock: true });
    if (!cita) throw fail("Esa cita ya no existe", 404);
    const actual = await recurso(cita.resource_id, transaction).catch(() => null);
    if (actual) assertPuedeAtender(req, actual);
    else if (!puede(req, "agenda.book")) throw fail("Sin permiso", 403);
    await alcance(req, cita.warehouse_id);

    const mueve = ["date", "start_min", "resource_id", "product_ids"].some(k => body[k] !== undefined);
    if (mueve && !["pendiente", "confirmada", "en_curso"].includes(cita.status)) {
      throw fail("Esta cita ya no se puede mover");
    }

    const patch = {};
    if (body.notes !== undefined) patch.notes = String(body.notes || "").trim().slice(0, 300) || null;
    if (body.customer_id !== undefined || body.customer_name !== undefined) {
      Object.assign(patch, await datosCliente({ ...cita.toJSON(), ...body }, transaction));
    }

    if (mueve) {
      const antes = partes(cita.starts_at);
      const fecha = body.date !== undefined ? String(body.date) : antes.fecha;
      dia(fecha);
      const ini = body.start_min !== undefined ? int(body.start_min) : antes.min;
      if (!(ini >= 0 && ini < 1440)) throw fail("Hora no válida");

      const viejos = await AppointmentItem.findAll({ where: { appointment_id: cita.id }, transaction });
      const productIds = body.product_ids !== undefined ? body.product_ids : viejos.map(i => i.product_id);
      const servs = await servicios(req.company_id, productIds, transaction);
      // Los servicios que ya tenía conservan la duración con que se dieron.
      const durDe = (s) => viejos.find(v => v.product_id === s.id)?.duration_min ?? s.duration_min;
      const fin = ini + servs.reduce((t, s) => t + durDe(s), 0);
      if (fin > 1440) throw fail("La cita se pasaría de la medianoche");

      let resourceId = body.resource_id !== undefined ? (int(body.resource_id) || null) : cita.resource_id;
      if (!puede(req, "agenda.book") && resourceId !== cita.resource_id) throw fail("Solo puedes mover tus citas dentro de tu agenda", 403);
      const r = await ubicar(req, {
        warehouseId: cita.warehouse_id, resourceId, fecha, ini, fin, productIds: servs.map(s => s.id),
        excluir: cita.id, forzar: !!body.forzar, horario: cita.status !== "en_curso",
      }, transaction);

      Object.assign(patch, { resource_id: r.id, starts_at: instante(fecha, ini), ends_at: instante(fecha, fin) });
      if (body.product_ids !== undefined) {
        await AppointmentItem.destroy({ where: { appointment_id: cita.id }, transaction });
        await AppointmentItem.bulkCreate(servs.map(s => ({ appointment_id: cita.id, product_id: s.id, name: s.name, duration_min: durDe(s) })), { transaction });
      }
    }
    await cita.update({ ...patch, updated_at: new Date() }, { transaction });
    return cita;
  });
  olvidar(`agenda:${resultado.warehouse_id}`);
  return una(req, resultado.id);
}

/** Cambia el estado (confirmar, empezar, no llegó, cancelar, deshacer). */
async function cambiarEstado(req, id, status) {
  const cita = await sequelize.transaction(async (transaction) => {
    const c = await Appointment.findOne({ where: { id: int(id) }, transaction, lock: true });
    if (!c) throw fail("Esa cita ya no existe", 404);
    const r = await AgendaResource.findOne({ where: { id: c.resource_id }, transaction });
    assertPuedeAtender(req, r);
    await alcance(req, c.warehouse_id);
    if (c.status === status) return c;
    if (!(PASOS[c.status] || []).includes(status)) {
      throw fail(`Una cita ${c.status.replace("_", " ")} no puede pasar a ${status.replace("_", " ")}`);
    }
    // Volver a confirmada una que se canceló como "no llegó" la pone otra vez en la agenda:
    // si ya pasó su hora no estorba a nadie, y si no, el barbero lo decide en el momento.
    await c.update({ status, updated_at: new Date() }, { transaction });
    return c;
  });
  olvidar(`agenda:${cita.warehouse_id}`);
  return una(req, cita.id);
}

/**
 * Termina la cita y abre su cuenta en espera: los servicios de la cita más lo que se agregue
 * (la cera, el tratamiento que se vendió en el sillón). La cuenta queda a nombre del barbero
 * como vendedor (comisión) y como mesonero (waiter_id): al cobrarla pasa a quien la cobra, como
 * la cuenta de una mesa.
 *
 * body: { extras: [{ product_id, qty }], quitar: [product_id] }
 *   quitar: servicios reservados que al final no se hicieron (venía a corte y barba, solo se
 *   cortó). Salen de la cuenta; la cita conserva lo que se reservó.
 */
async function terminar(req, id, body = {}) {
  const createSale = require("../sales/createSale");
  const updateSale = require("../sales/updateSale");
  const { Serie, UserSerie, Product, Seller } = require("../../models");

  const cita = await Appointment.findOne({ where: { id: int(id) } });
  if (!cita) throw fail("Esa cita ya no existe", 404);
  const r = await AgendaResource.findOne({ where: { id: cita.resource_id } });
  assertPuedeAtender(req, r);
  await alcance(req, cita.warehouse_id);

  const extras = (Array.isArray(body.extras) ? body.extras : []).map(x => ({ product_id: int(x.product_id), qty: parseFloat(x.qty) }));
  if (extras.length > 30) throw fail("Demasiados productos");
  for (const x of extras) if (!(x.product_id > 0) || !(x.qty > 0) || x.qty > 999) throw fail("Revisa las cantidades de lo agregado");
  if (extras.length) {
    const ok = await Product.count({ where: { id: [...new Set(extras.map(x => x.product_id))], sellable: true, is_variant_parent: false } });
    if (ok !== new Set(extras.map(x => x.product_id)).size) throw fail("Uno de los productos ya no está a la venta");
  }

  // Ya terminada y con la cuenta abierta: lo agregado se suma a esa cuenta.
  if (cita.status === "terminada" && cita.sale_id) {
    const venta = await Sale.findOne({ where: { id: cita.sale_id }, attributes: ["id", "status"] });
    if (venta && ["espera", "borrador"].includes(venta.status)) {
      if (extras.length) await updateSale(venta.id, { append: extras.map(x => ({ product_id: x.product_id, qty: x.qty, note: null })) }, req);
      olvidar(`agenda:${cita.warehouse_id}`);
      return una(req, cita.id);
    }
    // Anulada la venta, la cita se puede terminar otra vez: abre una cuenta nueva.
    if (venta && venta.status !== "anulado") throw fail("Esta cita ya se cobró");
  }
  if (!["pendiente", "confirmada", "en_curso", "terminada"].includes(cita.status)) {
    throw fail("Una cita cancelada o en la que el cliente no llegó no se termina");
  }

  const items = await AppointmentItem.findAll({ where: { appointment_id: cita.id }, order: [["id", "ASC"]] });
  const quitar = new Set((Array.isArray(body.quitar) ? body.quitar : []).map(int));
  const lineas = [
    ...items.filter(i => !quitar.has(i.product_id)).map(i => ({ product_id: i.product_id, quantity: 1 })),
    ...extras.map(x => ({ product_id: x.product_id, quantity: x.qty })),
  ];
  if (!lineas.length) throw fail("La cuenta quedaría vacía: deja al menos un servicio o agrega algo");

  // La serie: la del usuario en esta sucursal o la primera activa, como la cuenta de una mesa.
  // La caja factura con la suya al cobrar. Solo series de FACTURA: el usuario suele tener
  // también la de notas de crédito, y si se creó primero la factura salía numerada NC-.
  const propias = req.employee?.id ? await UserSerie.findAll({ where: { user_id: req.employee.id }, attributes: ["serie_id"] }) : [];
  const deFactura = { warehouse_id: cita.warehouse_id, active: true, type: "factura" };
  const serie = await Serie.findOne({
    where: { ...deFactura, ...(propias.length ? { id: { [Op.in]: propias.map(s => s.serie_id) } } : {}) },
    order: [["id", "ASC"]],
  }) || await Serie.findOne({ where: deFactura, order: [["id", "ASC"]] });
  if (!serie) throw fail("La sucursal no tiene una serie activa para abrir la cuenta");

  // El vendedor solo si sigue activo: uno dado de baja haría fallar la cuenta entera.
  const vendedor = r.seller_id ? await Seller.findOne({ where: { id: r.seller_id, active: true }, attributes: ["id"] }) : null;

  const creada = await createSale({
    items: lineas,
    paid: 0,
    employee_id: req.employee?.id || null,
    customer_id: cita.customer_id || null,
    serie_id: serie.id,
    warehouse_id: cita.warehouse_id,
    hold: true,
    seller_id: vendedor?.id || null,
  }, req, { waiterId: r.employee_id || req.employee?.id || null });
  const saleId = creada?.data?.id ?? creada?.id;
  if (!saleId) throw fail("No se pudo abrir la cuenta", 500);

  await cita.update({ status: "terminada", sale_id: saleId, updated_at: new Date() });
  olvidar(`agenda:${cita.warehouse_id}`);
  return una(req, cita.id);
}

module.exports = { listarDia, porCobrar, una, deCliente, crear, editar, cambiarEstado, terminar, estadoCobro, pasoDe };
