const { PaymentJournal, PaymentJournalWarehouse, PaymentJournalMethod, Currency, Bank, Sale, Warehouse, Sequelize, sequelize } = require("../../models");
const { localDate, TZ } = require("../reports/shared");
const { visibleWarehouseIds, isAdmin, assertWarehouseAccess } = require("../../middleware/auth");
const { expenseRefSql } = require("../../utils/expenseReference");

function flattenJournal(j) {
  const jj = j.toJSON ? j.toJSON() : j;
  jj.currency_code    = jj.Currency?.code     ?? null;
  jj.currency_symbol  = jj.Currency?.symbol   ?? null;
  jj.currency_is_base = jj.Currency?.is_base  ?? null;
  // Sin la tasa, quien registra un egreso o ingreso en un diario en bolívares no podía
  // convertir el monto a base: se guardaba el importe en Bs. como si fueran Ref. y con
  // rate 1. getSummary ya la exponía; getAll debe hacerlo igual.
  jj.exchange_rate    = jj.Currency?.exchange_rate ?? 1;
  jj.bank_name        = jj.Bank?.name         ?? null;
  jj.warehouse_name   = jj.Warehouse?.name    ?? null;
  // Fuente de verdad de a qué sucursales atiende. Array vacío = todas (compartido).
  jj.warehouse_ids    = Array.isArray(jj.Sucursales) ? jj.Sucursales.map(w => w.id) : [];
  jj.warehouse_names  = Array.isArray(jj.Sucursales) ? jj.Sucursales.map(w => w.name) : [];
  // Métodos de la cuenta, en su orden. El primero es el principal (`type`).
  jj.methods = (jj.methods || [])
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map(m => ({ method_code: m.method_code, allows_inflow: m.allows_inflow, allows_outflow: m.allows_outflow }));
  if (!jj.methods.length && jj.type) jj.methods = [{ method_code: jj.type, allows_inflow: true, allows_outflow: true }];
  jj.opening_balance  = parseFloat(jj.opening_balance || 0);
  delete jj.Currency; delete jj.Bank; delete jj.Warehouse; delete jj.Sucursales;
  return jj;
}

// Condición SQL sobre "PaymentJournal": el diario atiende a alguna de estas sucursales, o a
// todas si no tiene ninguna asignada (compartido). `arg`: un id, una lista de ids, o "shared".
function journalServes(arg) {
  if (arg === "shared") {
    return Sequelize.literal(`NOT EXISTS (SELECT 1 FROM payment_journal_warehouses pjw WHERE pjw.journal_id = "PaymentJournal".id)`);
  }
  const ids = (Array.isArray(arg) ? arg : [arg]).map(n => parseInt(n, 10)).filter(Number.isInteger);
  const inClause = ids.length ? ids.join(",") : "NULL";
  return Sequelize.literal(`(
    NOT EXISTS (SELECT 1 FROM payment_journal_warehouses pjw WHERE pjw.journal_id = "PaymentJournal".id)
    OR EXISTS (SELECT 1 FROM payment_journal_warehouses pjw WHERE pjw.journal_id = "PaymentJournal".id AND pjw.warehouse_id IN (${inClause}))
  )`);
}

function tenantFilter(req) {
  const company_id  = req.employee?.company_id ?? null;
  const scoped      = !!company_id;
  return {
    tenantWhere: scoped ? { company_id } : {},
    tc:  scoped ? `AND p.company_id = ${parseInt(company_id)}`  : '',
    tce: scoped ? `AND e.company_id = ${parseInt(company_id)}`  : '',
    tp:  scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id',
    texp:scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id',
  };
}

// El diario (caja, banco) es de la empresa, pero lo que entra y sale de él ocurre en una
// sucursal. Sin este recorte, el Estado de Cuenta mostraba a cualquier gerente el saldo
// consolidado del negocio completo.
//
// Un cobro no guarda sucursal —la hereda de su venta—, así que se filtra por el join con
// sales; los ingresos y egresos sí tienen almacén propio.
// Las variantes `*Bare` son para las consultas de saldo, que van contra la tabla sin alias
// ni join: ahí el almacén del cobro se resuelve con una subconsulta sobre sales.
// `wid`: sucursal elegida a mano (Estado de Cuenta). Casi nunca el mismo banco es la misma
// cuenta en dos tiendas, así que hace falta poder aislar una sola sin sumarlas de cabeza.
// Se valida contra las sucursales del empleado antes de usarla.
async function warehouseFilter(req, wid = null) {
  if (wid) {
    await assertWarehouseAccess(req, wid);
    const list = String(parseInt(wid));
    return {
      whP: `AND s.warehouse_id IN (${list})`,
      whI: `AND i.warehouse_id IN (${list})`,
      whE: `AND e.warehouse_id IN (${list})`,
      whPBare: `AND sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
      whPCount: `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
      whIBare: `AND warehouse_id IN (${list})`,
      whEBare: `AND warehouse_id IN (${list})`,
    };
  }

  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) {                                          // admin: sin recorte
    return { whP: '', whI: '', whE: '', whPBare: '', whIBare: '', whEBare: '', whPCount: '' };
  }

  const ids = allowed.filter(Number.isInteger);
  if (!ids.length) {
    const no = 'AND FALSE';
    return { whP: no, whI: no, whE: no, whPBare: no, whIBare: no, whEBare: no, whPCount: no };
  }

  const list = ids.join(',');
  return {
    whP: `AND s.warehouse_id IN (${list})`,
    whI: `AND i.warehouse_id IN (${list})`,
    whE: `AND e.warehouse_id IN (${list})`,
    whPBare: `AND sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
    whPCount: `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
    whIBare: `AND warehouse_id IN (${list})`,
    whEBare: `AND warehouse_id IN (${list})`,
  };
}

// Qué diarios ve un empleado: los de sus sucursales más los compartidos (warehouse_id NULL),
// que son los que sirven a toda la empresa. El admin los ve todos.
//
// `wid`: con una sucursal elegida a mano, la lista se recorta a la suya (más los
// compartidos) en vez de a todas las asignadas al empleado.
async function journalScope(req, wid = null) {
  if (wid) {
    await assertWarehouseAccess(req, wid);
    return { [Sequelize.Op.and]: [journalServes(parseInt(wid))] };
  }
  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) return {};                    // admin: sin recorte
  const list = allowed.filter(Number.isInteger);
  if (!list.length) return {};
  return { [Sequelize.Op.and]: [journalServes(list)] };
}

// Un diario solo se puede crear o editar sobre una sucursal propia. `null` (compartido) es
// cosa del admin: afecta a todas las sucursales, no solo a la suya.
// Un depósito no atiende público ni cobra: una caja ahí no recibiría nunca un peso. Se
// valida en el servidor y no solo en el selector, para que el criterio valga también si el
// diario se crea por API.
async function assertNoEsDeposito(warehouseId) {
  if (!warehouseId) return;
  const almacen = await Warehouse.findByPk(warehouseId, { attributes: ['id', 'name', 'sells'] });
  if (almacen && almacen.sells === false) {
    const e = new Error(`${almacen.name} es un depósito: no maneja caja`);
    e.status = 400; e.isOperational = true; throw e;
  }
}

// Un diario puede atender a varias sucursales. Devuelve la lista normalizada (ints, sin
// repetidos). Vacía = compartido (todas): eso alcanza a sucursales que un encargado no
// administra, así que solo el admin lo puede dejar así.
async function resolveJournalWarehouses(req, warehouseIds) {
  const list = [...new Set((warehouseIds || []).map(n => parseInt(n, 10)).filter(Number.isInteger))];

  const admin = isAdmin(req);
  const allowed = admin ? null : await visibleWarehouseIds(req);

  if (!list.length) {
    if (admin) return [];
    // Un encargado sin elegir sucursal: si tiene una sola, se asume esa; si tiene varias, decide.
    if (allowed.length === 1) return [allowed[0]];
    const e = new Error("Indica a qué sucursales pertenece el diario"); e.status = 400; e.isOperational = true; throw e;
  }

  for (const wid of list) {
    await assertNoEsDeposito(wid);
    if (!admin && !allowed.includes(wid)) {
      const e = new Error("No tienes acceso a una de esas sucursales"); e.status = 403; e.isOperational = true; throw e;
    }
  }
  return list;
}

async function getAll(req) {
  const { tenantWhere } = tenantFilter(req);
  const journals = await PaymentJournal.findAll({
    // Los absorbidos al fusionar cuentas ya no existen para el usuario: su historia está en
    // la cuenta que los absorbió.
    where: { ...tenantWhere, merged_into_id: null, ...(await journalScope(req)) },
    include: [
      { model: PaymentJournalMethod, as: 'methods', attributes: ['id', 'method_code', 'allows_inflow', 'allows_outflow', 'sort_order'], required: false },
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
      { model: Bank,     attributes: ['name'],                                        required: false },
      { model: Warehouse, attributes: ['id', 'name'],                                 required: false },
      { model: Warehouse, as: 'Sucursales', attributes: ['id', 'name'], through: { attributes: [] }, required: false },
    ],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });
  return { data: journals.map(flattenJournal) };
}

// El diario es la cuenta. Dos diarios del mismo banco, moneda y sucursales son la misma
// cuenta, salvo que el número de cuenta los distinga (Venezuela 1 y Venezuela 2): un método
// nuevo se agrega a la cuenta existente, no se abre otro diario. Los NULL cuentan como valor.
const widKey = (ids) => [...new Set((ids || []).map(Number))].sort((a, b) => a - b).join(",");
const cuentaKey = (n) => String(n || "").replace(/\D/g, "");

async function assertNoDuplicate({ type, bank_id, currency_id, warehouse_ids, account_number }, excludeId = null) {
  const where = {
    bank_id:     bank_id || null,
    currency_id: currency_id || null,
    merged_into_id: null,
  };
  // Sin banco (efectivo, otros): cada caja se distingue además por su método principal.
  if (!bank_id) where.type = type || null;
  if (excludeId) where.id = { [Sequelize.Op.ne]: excludeId };
  const candidatos = await PaymentJournal.findAll({
    where,
    include: [{ model: Warehouse, as: 'Sucursales', attributes: ['id'], through: { attributes: [] }, required: false }],
  });
  const mine = widKey(warehouse_ids);
  const num = cuentaKey(account_number);
  const dup = candidatos.find(c => widKey((c.Sucursales || []).map(w => w.id)) === mine && cuentaKey(c.account_number) === num);
  if (dup) {
    const e = new Error(bank_id
      ? `Ya existe la cuenta "${dup.name}" en ese banco, moneda y sucursales${dup.active ? "" : " (está inactiva: actívala)"}. Agrégale el método ahí; si es otra cuenta del mismo banco, indica su número.`
      : `Ya existe el diario "${dup.name}" con el mismo método, moneda y sucursales${dup.active ? "" : " (está inactivo: actívalo)"}. Usa ese en vez de crear otro.`);
    e.status = 409; e.isOperational = true; throw e;
  }
}

// Acepta `warehouse_ids` (array, forma nueva) o `warehouse_id` (un id/NULL, compat).
function readWarehouseInput(body) {
  if (Array.isArray(body.warehouse_ids)) return { given: true, ids: body.warehouse_ids };
  if (body.warehouse_id !== undefined)   return { given: true, ids: body.warehouse_id ? [body.warehouse_id] : [] };
  return { given: false, ids: [] };
}

const bad = (msg) => { const e = new Error(msg); e.status = 400; e.isOperational = true; return e; };

// Métodos de la cuenta, cada uno con su sentido: [{ method_code, allows_inflow, allows_outflow }].
// Recibe y paga llegan como booleanos o texto. Un método que no recibe ni paga no sirve: se
// rechaza. Devuelve null si el cuerpo no trae la lista (clientes viejos que solo mandan `type`).
const flag = (v) => v === undefined ? true : (v === true || v === "true" || v === 1 || v === "1");
function leerMetodos(body) {
  if (!Array.isArray(body.methods)) return null;
  const vistos = new Set();
  const lista = [];
  for (const m of body.methods) {
    const code = String(m?.method_code || "").trim();
    if (!code || vistos.has(code)) continue;
    vistos.add(code);
    const allows_inflow = flag(m.allows_inflow), allows_outflow = flag(m.allows_outflow);
    if (!allows_inflow && !allows_outflow) throw bad(`El método "${code}" tiene que recibir, pagar o las dos cosas`);
    lista.push({ method_code: code, allows_inflow, allows_outflow, sort_order: lista.length });
  }
  if (!lista.length) throw bad("La cuenta necesita al menos un método de pago");
  return lista;
}

// Número de cuenta y saldo inicial (lo que tenía la cuenta el día que empezó a llevarse
// aquí). Con monto y sin fecha, cuenta desde hoy. Solo devuelve lo que vino en el cuerpo.
function leerCuenta(body, actual = {}) {
  const out = {};
  if (body.account_number !== undefined) out.account_number = String(body.account_number || "").trim() || null;
  if (body.opening_balance !== undefined) {
    const vacio = body.opening_balance === "" || body.opening_balance === null;
    const n = vacio ? 0 : parseFloat(String(body.opening_balance).replace(",", "."));
    if (!Number.isFinite(n)) throw bad("Saldo inicial inválido");
    out.opening_balance = Math.round(n * 100) / 100;
  }
  if (body.opening_date !== undefined) {
    const d = String(body.opening_date || "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad("Fecha del saldo inicial inválida");
    out.opening_date = d || null;
  }
  const saldo = out.opening_balance ?? parseFloat(actual.opening_balance || 0);
  const fecha = out.opening_date !== undefined ? out.opening_date : actual.opening_date;
  if (saldo && !fecha) out.opening_date = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return out;
}

async function guardarMetodos(journal, metodos, transaction) {
  await PaymentJournalMethod.destroy({ where: { journal_id: journal.id }, transaction });
  await PaymentJournalMethod.bulkCreate(
    metodos.map(m => ({ ...m, journal_id: journal.id, company_id: journal.company_id })),
    { transaction },
  );
}

async function createJournal(body, req) {
  const { name, bank_id, color, sort_order, currency_id } = body;
  if (!name) throw bad("El nombre es requerido");
  const metodos = leerMetodos(body)
    || (body.type ? [{ method_code: body.type, allows_inflow: true, allows_outflow: true, sort_order: 0 }] : null);
  if (!metodos) throw bad("La cuenta necesita al menos un método de pago");
  const type = metodos[0].method_code;
  const cuenta = leerCuenta(body);
  const widList = await resolveJournalWarehouses(req, readWarehouseInput(body).ids);
  await assertNoDuplicate({ type, bank_id, currency_id, warehouse_ids: widList, account_number: cuenta.account_number });
  const journal = await sequelize.transaction(async (transaction) => {
    const j = await PaymentJournal.create({
      name,
      warehouse_id: widList[0] ?? null,   // cache denormalizada
      type,
      bank_id:     bank_id     || null,
      color:       color       || "#555555",
      sort_order:  sort_order  ?? 0,
      currency_id: currency_id || null,
      ...cuenta,
    }, { transaction });
    await j.setSucursales(widList, { transaction });
    await guardarMetodos(j, metodos, transaction);
    return j;
  });
  return { data: journal };
}

async function updateJournal(id, body, req) {
  const { name, type, bank_id, color, active, sort_order, currency_id } = body;
  const journal = await PaymentJournal.findByPk(id, {
    include: [{ model: Warehouse, as: 'Sucursales', attributes: ['id'], through: { attributes: [] }, required: false }],
  });
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  const metodos = leerMetodos(body);
  const cuenta = leerCuenta(body, journal);
  // No se edita un diario de sucursales ajenas; los compartidos son del admin.
  const actuales = (journal.Sucursales || []).map(w => w.id);
  for (const wid of actuales) await assertWarehouseAccess(req, wid, { optional: true });

  const wInput = readWarehouseInput(body);
  const widList = wInput.given ? await resolveJournalWarehouses(req, wInput.ids) : actuales;

  // Solo se valida el duplicado si la edición TOCA la identidad (banco/moneda/sucursales/número):
  // así un duplicado que ya existía se puede renombrar/recolorear/desactivar, pero no crear uno.
  const nextType = metodos ? metodos[0].method_code : (type !== undefined ? (type || null) : journal.type);
  const nextBank = bank_id !== undefined ? (bank_id || null) : journal.bank_id;
  const nextCur  = currency_id !== undefined ? (currency_id || null) : journal.currency_id;
  const nextNum  = cuenta.account_number !== undefined ? cuenta.account_number : journal.account_number;
  const identidadCambia =
    (!nextBank && nextType !== journal.type) ||
    nextBank !== journal.bank_id ||
    nextCur !== journal.currency_id ||
    cuentaKey(nextNum) !== cuentaKey(journal.account_number) ||
    widKey(widList) !== widKey(actuales);
  if (identidadCambia) {
    await assertNoDuplicate({ type: nextType, bank_id: nextBank, currency_id: nextCur, warehouse_ids: widList, account_number: nextNum }, journal.id);
  }
  await sequelize.transaction(async (transaction) => {
    await journal.update({
      name,
      warehouse_id: widList[0] ?? null,
      type:        nextType,
      bank_id:     bank_id     || null,
      color:       color       || "#555555",
      active:      active      ?? true,
      sort_order:  sort_order  ?? 0,
      currency_id: currency_id || null,
      ...cuenta,
    }, { transaction });
    if (wInput.given) await journal.setSucursales(widList, { transaction });
    if (metodos) await guardarMetodos(journal, metodos, transaction);
  });
  return { data: journal };
}

async function deleteJournal(id, req) {
  const count = await Sale.count({ where: { payment_journal_id: id } });
  if (count > 0) { const e = new Error("No se puede eliminar: tiene ventas asociadas"); e.status = 400; throw e; }
  const journal = await PaymentJournal.findByPk(id);
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, journal.warehouse_id, { optional: true });
  await PaymentJournalWarehouse.destroy({ where: { journal_id: id } });
  await journal.destroy();
  return { message: "Diario eliminado" };
}

async function getSummary(req) {
  const { date_from, date_to, warehouse_id } = req.query;
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  const { tenantWhere, tc, tce } = tenantFilter(req);
  const { whP, whI, whE } = await warehouseFilter(req, wid);
  const company_id  = req.employee?.company_id ?? null;
  const tci = company_id ? `AND i.company_id = ${parseInt(company_id)}` : '';

  // El filtro de rango y el "hoy" de abajo deben cortar el día igual. Antes el rango
  // comparaba contra literales sin convertir (día UTC) mientras el "hoy" ya usaba hora
  // local, así que un cobro de las 9 PM aparecía en una cifra y no en la otra.
  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  const buildDateClause = (alias) => {
    const col = localDate(`${alias}."created_at"`);
    let clause = '';
    if (safeFrom) clause += ` AND ${col} >= '${safeFrom}'::date`;
    if (safeTo)   clause += ` AND ${col} <= '${safeTo}'::date`;
    return clause;
  };
  const pDate = buildDateClause('p');
  const eDate = buildDateClause('e');
  const iDate = buildDateClause('i');

  const todayLocal = `(NOW() AT TIME ZONE '${TZ}')::date`;
  const todayP = `${localDate('p.created_at')} = ${todayLocal}`;
  const todayE = `${localDate('e.created_at')} = ${todayLocal}`;
  const todayI = `${localDate('i.created_at')} = ${todayLocal}`;

  const journals = await PaymentJournal.findAll({
    attributes: [
      'id', 'name', 'type', 'bank_id', 'color', 'currency_id', 'warehouse_id',
      [Sequelize.literal(`(
        SELECT COUNT(p.id) FROM payments p
        LEFT JOIN sales s ON p.sale_id = s.id
        WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc} ${whP}
      )`), 'tx_count'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p LEFT JOIN sales s ON p.sale_id = s.id
         WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc} ${whP})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' ${iDate} ${tci} ${whI})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' ${eDate} ${tce} ${whE})
      )`), 'total_ingresos'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p LEFT JOIN sales s ON p.sale_id = s.id
         WHERE p.payment_journal_id = "PaymentJournal".id AND ${todayP} ${tc} ${whP})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' AND ${todayI} ${tci} ${whI})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' AND ${todayE} ${tce} ${whE})
      )`), 'ingresos_hoy'],
    ],
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
      { model: Bank,     attributes: ['name'],                                        required: false },
      { model: Warehouse, attributes: ['name'],                                       required: false }
    ],
    where: { active: true, ...tenantWhere, ...(await journalScope(req, wid)) },
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  const data = journals.map(j => {
    const jj = j.get({ plain: true });
    jj.bank_name        = jj.Bank?.name             ?? null;
    jj.warehouse_name    = jj.Warehouse?.name        ?? null;
    jj.currency_code    = jj.Currency?.code         ?? null;
    jj.currency_symbol  = jj.Currency?.symbol       ?? null;
    jj.currency_is_base = jj.Currency?.is_base      ?? true;
    jj.exchange_rate    = jj.Currency?.exchange_rate ?? 1;
    delete jj.Bank; delete jj.Currency; delete jj.Warehouse; delete jj.Payments;
    return jj;
  });
  return { data };
}

// Saldo inicial de una o varias cuentas frente a un rango de fechas: cuánto suma al saldo
// actual, cuánto al arrastre previo a `desde`, y qué líneas "Saldo inicial" caen en el rango.
// La línea va con la fecha de apertura y antes de todo lo de ese día.
function apertura(journals, desde, hasta) {
  const out = { total: 0, previo: 0, lineas: [] };
  for (const j of journals) {
    const monto = parseFloat(j.opening_balance || 0);
    if (!monto) continue;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(j.opening_date || "")) ? String(j.opening_date) : "2000-01-01";
    out.total += monto;
    if (desde && fecha < desde) out.previo += monto;
    else if (!hasta || fecha <= hasta) out.lineas.push({ fecha, monto });
  }
  return out;
}
const aperturaSql = (lineas) => lineas.map(l => `
        UNION ALL
        SELECT 0 AS id, 'apertura' AS type,
          CAST('${l.fecha}' AS date)::timestamptz                         AS date,
          CAST('${l.fecha}' AS date)::timestamptz - INTERVAL '1 second'   AS created_at,
          'Saldo inicial' AS reference, 'Saldo inicial de la cuenta' AS concept,
          CAST(${Number(l.monto)} AS numeric) AS amount_local, CAST(${Number(l.monto)} AS numeric) AS amount_base,
          1 AS rate, NULL AS doc_ref, NULL AS notes, 1 AS group_count, 'activo' AS status,
          NULL AS payment_method`).join("");

async function getMovements(req) {
  const { id } = req.params;
  const { date_from, date_to, limit = 200, offset = 0 } = req.query;
  const { tc, tce: te, tp, texp } = tenantFilter(req);
  const { whP, whI, whE, whPBare, whIBare, whEBare, whPCount } = await warehouseFilter(req);

  // Tenant filter para incomes (mismo patrón que tp/texp pero para tabla incomes)
  const company_id  = req.employee?.company_id ?? null;
  const scoped      = !!company_id;
  const ti   = scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id';
  const tci  = scoped ? `AND i.company_id = ${parseInt(company_id)}` : '';

  const journal = await PaymentJournal.findByPk(id, {
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
      { model: Bank,     attributes: ['name'] },
    ],
  });
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  // Un diario de otra sucursal no se abre ni para mirar: sus movimientos son su caja.
  await assertWarehouseAccess(req, journal.warehouse_id, { optional: true });

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  // reference_date es DATE (fecha local ya elegida por el cajero); date y created_at son
  // TIMESTAMPTZ y hay que llevarlos a fecha local antes de comparar. Sin esto el día de
  // corte de un pago con referencia y el de uno sin ella no eran el mismo.
  const payDay = `COALESCE(p.reference_date, ${localDate('p.created_at')})`;
  const expDay = localDate('COALESCE(e.date, e.created_at)');
  const incDay = localDate('COALESCE(i.date, i.created_at)');

  let datePay = '';
  let dateExp = '';
  let dateInc = '';
  if (safeFrom) {
    datePay += ` AND ${payDay} >= '${safeFrom}'::date`;
    dateExp += ` AND ${expDay} >= '${safeFrom}'::date`;
    dateInc += ` AND ${incDay} >= '${safeFrom}'::date`;
  }
  if (safeTo) {
    datePay += ` AND ${payDay} <= '${safeTo}'::date`;
    dateExp += ` AND ${expDay} <= '${safeTo}'::date`;
    dateInc += ` AND ${incDay} <= '${safeTo}'::date`;
  }

  // Saldo real del diario — incluye payments (ventas) + incomes (manuales) - expenses
  const [currBal] = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE TRUE ${tp} ${whPBare}), 0)
      + COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM incomes  WHERE status = 'activo' AND TRUE ${ti} ${whIBare}), 0)
      - COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM expenses WHERE status = 'activo' AND TRUE ${texp} ${whEBare}), 0)
    ) as balance
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });
  const ap = apertura([journal], safeFrom, safeTo);
  const currentBalance = parseFloat(currBal?.balance || 0) + ap.total;

  const [countResult] = await sequelize.query(`
    SELECT (
      -- Un cobro conjunto es una sola línea en el listado, así que también cuenta como una
      -- sola para la paginación; si no, la última página quedaba vacía.
      (SELECT COUNT(DISTINCT COALESCE(p.batch_id, CONCAT('p', p.id))) FROM payments p
        WHERE p.payment_journal_id = :id ${datePay} ${tc} ${whPCount})
      +
      (SELECT COUNT(*) FROM incomes  i WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci} ${whI})
      +
      (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te} ${whE})
    ) as total
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

  // Saldo de arrastre: todo lo ocurrido ANTES de date_from (si hay filtro de fecha)
  let preBalance = 0;
  if (safeFrom) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE COALESCE(reference_date, ${localDate('created_at')}) < :date_from ${tp} ${whPBare}), 0)
        + COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM incomes  WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < :date_from ${ti} ${whIBare}), 0)
        - COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < :date_from ${texp} ${whEBare}), 0)
      ) as balance
    `, { replacements: { id, date_from: safeFrom }, type: Sequelize.QueryTypes.SELECT });
    preBalance = parseFloat(prevBal?.balance || 0);
  }
  preBalance += ap.previo;

  // Window function calcula el saldo acumulado en orden ASC; el query externo ordena DESC y pagina.
  //
  // Se ordena por el DÍA del movimiento y se desempata por created_at, y no por la fecha
  // completa: `date` sale de un COALESCE que mezcla peras con manzanas —reference_date y
  // expenses.date son fechas sin hora (medianoche), mientras que un egreso sin fecha propia
  // cae a su created_at con la hora real—. Comparando el instante, ese egreso de las 13:33 se
  // colaba por encima de todos los cobros del mismo día (fijados a las 00:00) y separaba un
  // cobro de su propio vuelto. Por día, todo lo del 24 se ordena por la hora en que ocurrió.
  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT *,
        SUM(CASE WHEN type IN ('ingreso', 'apertura') THEN amount_local ELSE -amount_local END)
          OVER (ORDER BY ${localDate('date')} ASC, created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          + :pre_balance AS balance
      FROM (
        SELECT
          p.id,
          'ingreso'                                               AS type,
          COALESCE(p.reference_date, p.created_at)              AS date,
          p.created_at                                           AS created_at,
          COALESCE(s.invoice_number, CONCAT('PAY-', p.id))      AS reference,
          COALESCE(c.name, 'Pago de venta')                     AS concept,
          (p.amount * COALESCE(p.exchange_rate, 1))             AS amount_local,
          p.amount                                               AS amount_base,
          COALESCE(p.exchange_rate, 1)                          AS rate,
          p.reference_number                                     AS doc_ref,
          p.notes,
          1                                                      AS group_count,
          'activo'                                               AS status,
          p.payment_method
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id = :id AND p.batch_id IS NULL ${datePay} ${tc} ${whP}

        UNION ALL

        -- Cobro conjunto: varias facturas saldadas con un solo monto. Va como UNA línea, por
        -- su total. La caja se cuadra contra lo que entró físicamente, y lo que entró fue un
        -- pago; desglosarlo por factura acá obligaba a sumar a mano tres importes sueltos
        -- para reconocer el billete que recibió el cajero. El detalle por factura sigue
        -- entero en la tabla y en el módulo de Pagos.
        SELECT
          MIN(p.id)                                              AS id,
          'ingreso'                                               AS type,
          MIN(COALESCE(p.reference_date, p.created_at))         AS date,
          MIN(p.created_at)                                      AS created_at,
          string_agg(COALESCE(s.invoice_number, CONCAT('#', p.sale_id)), ' · '
                     ORDER BY s.invoice_number)                  AS reference,
          COALESCE(MIN(c.name), 'Pago de venta')                AS concept,
          SUM(p.amount * COALESCE(p.exchange_rate, 1))          AS amount_local,
          SUM(p.amount)                                          AS amount_base,
          MAX(COALESCE(p.exchange_rate, 1))                     AS rate,
          MIN(p.reference_number)                                AS doc_ref,
          MIN(p.notes)                                           AS notes,
          COUNT(*)::int                                          AS group_count,
          'activo'                                               AS status,
          MIN(p.payment_method)                                  AS payment_method
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id = :id AND p.batch_id IS NOT NULL ${datePay} ${tc} ${whP}
        GROUP BY p.batch_id

        UNION ALL

        SELECT
          i.id,
          'ingreso'                                               AS type,
          COALESCE(i.date, i.created_at)                        AS date,
          i.created_at                                           AS created_at,
          COALESCE(i.reference, CONCAT('INC-', i.id))           AS reference,
          i.description                                          AS concept,
          (i.amount * COALESCE(i.rate, 1))                      AS amount_local,
          i.amount                                               AS amount_base,
          COALESCE(i.rate, 1)                                    AS rate,
          NULL                                                   AS doc_ref,
          i.notes,
          1                                                      AS group_count,
          i.status,
          i.payment_method
        FROM incomes i
        WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci} ${whI}

        UNION ALL

        SELECT
          e.id,
          'egreso'                                               AS type,
          COALESCE(e.date, e.created_at)                        AS date,
          e.created_at                                           AS created_at,
          COALESCE(${expenseRefSql('e')}, CONCAT('EGR-', e.id))          AS reference,
          e.description                                          AS concept,
          (e.amount * COALESCE(e.rate, 1))                     AS amount_local,
          e.amount                                               AS amount_base,
          COALESCE(e.rate, 1)                                   AS rate,
          NULL                                                   AS doc_ref,
          e.notes,
          1                                                      AS group_count,
          e.status,
          e.payment_method
        FROM expenses e
        WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te} ${whE}
        ${aperturaSql(ap.lineas)}
      ) all_movements
    ) with_balance
    ORDER BY ${localDate('date')} DESC, created_at DESC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: { id, pre_balance: preBalance, limit: parseInt(limit), offset: parseInt(offset) },
    type: Sequelize.QueryTypes.SELECT,
  });

  const data = rows.map(row => ({
    ...row,
    amount_local: parseFloat(row.amount_local || 0),
    amount_base:  parseFloat(row.amount_base  || 0),
    rate:         parseFloat(row.rate         || 1),
    balance:      parseFloat(row.balance      || 0),
    // >1 cuando la línea resume un cobro conjunto: la caja recibió un solo monto por
    // varias facturas.
    group_count:  parseInt(row.group_count || 1, 10),
  }));

  const jj = journal.get({ plain: true });
  return {
    journal: {
      id:              jj.id,
      name:            jj.name,
      color:           jj.color,
      currency_code:   jj.Currency?.code   || null,
      currency_symbol: jj.Currency?.symbol || 'Ref.',
      bank_name:       jj.Bank?.name       || null,
      account_number:  jj.account_number   || null,
      opening_balance: parseFloat(jj.opening_balance || 0),
      opening_date:    jj.opening_date     || null,
      current_balance: currentBalance,
    },
    data,
    total: parseInt(countResult?.total || 0) + ap.lineas.length,
  };
}

async function getBankMovements(req) {
  const { bankId } = req.params;
  const { date_from, date_to, limit = 200, offset = 0, warehouse_id } = req.query;
  const company_id = req.employee?.company_id ?? null;
  const scoped = !!company_id;

  // El mismo banco puede tener una cuenta real por sucursal: "Banco de Venezuela" en la
  // tienda A y otra completamente distinta en la B. La tarjeta que el usuario tocó ya sabe
  // a cuál se refiere —una sucursal concreta, o la caja compartida (warehouse_id null)— y
  // esa es la única que se abre acá. Sin esta sucursal explícita (llamadas viejas) se cae al
  // recorte de siempre: todo lo que el empleado tiene permitido ver, sin distinguir cuentas.
  const hasWid  = warehouse_id !== undefined && warehouse_id !== '';
  const sharedOnly = hasWid && (warehouse_id === 'null' || warehouse_id === '0');
  const wid = hasWid && !sharedOnly ? parseInt(warehouse_id) : null;
  if (wid) await assertWarehouseAccess(req, wid);

  const journalWhere = { bank_id: bankId, active: true, merged_into_id: null, ...(scoped ? { company_id } : {}) };
  if (sharedOnly)   journalWhere[Sequelize.Op.and] = [journalServes("shared")];
  else if (wid)     journalWhere[Sequelize.Op.and] = [journalServes(wid)];
  else Object.assign(journalWhere, await journalScope(req));

  // Todos los diarios activos del banco (filtrado por empresa y por sucursal: un banco
  // puede tener cajas de varias tiendas y cada una solo suma las suyas)
  const bankJournals = await PaymentJournal.findAll({
    where: journalWhere,
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
      { model: Bank,     attributes: ['name', 'id'] },
    ],
  });

  if (!bankJournals.length) {
    const e = new Error("Banco sin diarios activos"); e.status = 404; throw e;
  }

  const jList  = bankJournals.map(j => j.id).join(',');
  const first  = bankJournals[0].get({ plain: true });
  const tcBase = scoped ? `AND company_id = ${parseInt(company_id)}` : '';
  const tp     = ` AND payment_journal_id IN (${jList}) ${tcBase}`;
  const tc     = scoped ? `AND p.company_id = ${parseInt(company_id)}` : '';
  const tci    = scoped ? `AND i.company_id = ${parseInt(company_id)}` : '';
  const te     = scoped ? `AND e.company_id = ${parseInt(company_id)}` : '';
  const { whP, whI, whE, whPBare, whIBare, whEBare, whPCount } = await warehouseFilter(req, wid);

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  const payDay = `COALESCE(p.reference_date, ${localDate('p.created_at')})`;
  const expDay = localDate('COALESCE(e.date, e.created_at)');
  const incDay = localDate('COALESCE(i.date, i.created_at)');

  let datePay = '', dateExp = '', dateInc = '';
  if (safeFrom) {
    datePay += ` AND ${payDay} >= '${safeFrom}'::date`;
    dateExp += ` AND ${expDay} >= '${safeFrom}'::date`;
    dateInc += ` AND ${incDay} >= '${safeFrom}'::date`;
  }
  if (safeTo) {
    datePay += ` AND ${payDay} <= '${safeTo}'::date`;
    dateExp += ` AND ${expDay} <= '${safeTo}'::date`;
    dateInc += ` AND ${incDay} <= '${safeTo}'::date`;
  }

  const [currBal] = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE TRUE ${tp} ${whPBare}), 0)
      + COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM incomes  WHERE status = 'activo' AND TRUE ${tp} ${whIBare}), 0)
      - COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM expenses WHERE status = 'activo' AND TRUE ${tp} ${whEBare}), 0)
    ) as balance
  `, { type: Sequelize.QueryTypes.SELECT });
  const ap = apertura(bankJournals, safeFrom, safeTo);
  const currentBalance = parseFloat(currBal?.balance || 0) + ap.total;

  const [countResult] = await sequelize.query(`
    SELECT (
      (SELECT COUNT(DISTINCT COALESCE(p.batch_id, CONCAT('p', p.id))) FROM payments p WHERE p.payment_journal_id IN (${jList}) ${datePay} ${tc} ${whPCount})
      + (SELECT COUNT(*) FROM incomes  i WHERE i.payment_journal_id IN (${jList}) AND i.status = 'activo' ${dateInc} ${tci} ${whI})
      + (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id IN (${jList}) AND e.status = 'activo' ${dateExp} ${te} ${whE})
    ) as total
  `, { type: Sequelize.QueryTypes.SELECT });

  let preBalance = 0;
  if (safeFrom) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE COALESCE(reference_date, ${localDate('created_at')}) < '${safeFrom}'::date ${tp} ${whPBare}), 0)
        + COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM incomes  WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < '${safeFrom}'::date ${tp} ${whIBare}), 0)
        - COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < '${safeFrom}'::date ${tp} ${whEBare}), 0)
      ) as balance
    `, { type: Sequelize.QueryTypes.SELECT });
    preBalance = parseFloat(prevBal?.balance || 0);
  }
  preBalance += ap.previo;

  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT *,
        SUM(CASE WHEN type IN ('ingreso', 'apertura') THEN amount_local ELSE -amount_local END)
          OVER (ORDER BY ${localDate('date')} ASC, created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          + ${preBalance} AS balance
      FROM (
        SELECT p.id, 'ingreso' AS type, COALESCE(p.reference_date, p.created_at) AS date,
          p.created_at                                      AS created_at,
          COALESCE(s.invoice_number, CONCAT('PAY-', p.id)) AS reference,
          COALESCE(c.name, 'Pago de venta')                AS concept,
          (p.amount * COALESCE(p.exchange_rate, 1))        AS amount_local,
          p.amount                                          AS amount_base,
          COALESCE(p.exchange_rate, 1)                     AS rate,
          p.reference_number                                AS doc_ref,
          p.notes, 1 AS group_count, 'activo'               AS status,
          p.payment_method
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id IN (${jList}) AND p.batch_id IS NULL ${datePay} ${tc} ${whP}

        UNION ALL

        -- Cobro conjunto: una línea por lote, igual que en el diario (ver getMovements).
        SELECT MIN(p.id) AS id, 'ingreso' AS type,
          MIN(COALESCE(p.reference_date, p.created_at))    AS date,
          MIN(p.created_at)                                 AS created_at,
          string_agg(COALESCE(s.invoice_number, CONCAT('#', p.sale_id)), ' · '
                     ORDER BY s.invoice_number)             AS reference,
          COALESCE(MIN(c.name), 'Pago de venta')           AS concept,
          SUM(p.amount * COALESCE(p.exchange_rate, 1))     AS amount_local,
          SUM(p.amount)                                     AS amount_base,
          MAX(COALESCE(p.exchange_rate, 1))                AS rate,
          MIN(p.reference_number)                           AS doc_ref,
          MIN(p.notes) AS notes, COUNT(*)::int AS group_count, 'activo' AS status,
          MIN(p.payment_method) AS payment_method
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id IN (${jList}) AND p.batch_id IS NOT NULL ${datePay} ${tc} ${whP}
        GROUP BY p.batch_id

        UNION ALL

        SELECT i.id, 'ingreso' AS type, COALESCE(i.date, i.created_at) AS date,
          i.created_at                                 AS created_at,
          COALESCE(i.reference, CONCAT('INC-', i.id)) AS reference,
          i.description AS concept,
          (i.amount * COALESCE(i.rate, 1)) AS amount_local,
          i.amount AS amount_base, COALESCE(i.rate, 1) AS rate,
          NULL AS doc_ref, i.notes, 1 AS group_count, i.status, i.payment_method
        FROM incomes i
        WHERE i.payment_journal_id IN (${jList}) AND i.status = 'activo' ${dateInc} ${tci} ${whI}

        UNION ALL

        SELECT e.id, 'egreso' AS type, COALESCE(e.date, e.created_at) AS date,
          e.created_at                                 AS created_at,
          COALESCE(${expenseRefSql('e')}, CONCAT('EGR-', e.id)) AS reference,
          e.description AS concept,
          (e.amount * COALESCE(e.rate, 1)) AS amount_local,
          e.amount AS amount_base, COALESCE(e.rate, 1) AS rate,
          NULL AS doc_ref, e.notes, 1 AS group_count, e.status, e.payment_method
        FROM expenses e
        WHERE e.payment_journal_id IN (${jList}) AND e.status = 'activo' ${dateExp} ${te} ${whE}
        ${aperturaSql(ap.lineas)}
      ) all_movements
    ) with_balance
    ORDER BY ${localDate('date')} DESC, created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
  `, { type: Sequelize.QueryTypes.SELECT });

  return {
    journal: {
      id:              null,
      name:            first.Bank?.name || 'Banco',
      color:           first.color,
      currency_code:   first.Currency?.code   || null,
      currency_symbol: first.Currency?.symbol || 'Ref.',
      bank_name:       first.Bank?.name       || null,
      current_balance: currentBalance,
    },
    data: rows.map(row => ({
      ...row,
      amount_local: parseFloat(row.amount_local || 0),
      amount_base:  parseFloat(row.amount_base  || 0),
      rate:         parseFloat(row.rate         || 1),
      balance:      parseFloat(row.balance      || 0),
    })),
    total: parseInt(countResult?.total || 0) + ap.lineas.length,
  };
}

module.exports = { getAll, createJournal, updateJournal, deleteJournal, getSummary, getMovements, getBankMovements };
