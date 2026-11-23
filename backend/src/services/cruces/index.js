'use strict';

// Cruce de cuentas con proveedores (migración 20261126100000-cruce-cuentas).
//
// Un proveedor que además se lleva mercancía de la tienda tiene DOS fichas con el mismo RIF: la
// de proveedor (sus compras: lo que la tienda le debe) y la de cliente (sus ventas: lo que él le
// debe a la tienda). Lo que se lleva es una venta normal, con su precio y su descuento si se le
// da. El cruce salda las dos deudas por el mismo monto, de lo más viejo a lo más nuevo en cada
// lado, SIN mover caja:
//  - compras: purchase_payments sin diario ni egreso;
//  - ventas:  payments sin diario (como el crédito de un cambio, ver returns/exchangeService).
// Los dos con método 'cruce' y batch_id 'cruce:<id>'. Los reportes de dinero (arqueo, Ingresos y
// egresos, diarios, comisiones) ya excluyen los pagos sin diario, así que no inflan la caja; los
// saldos sí los cuentan, que es lo que se busca. Se anula entero, nunca un pago suelto.

const { sequelize, Sequelize, Customer, Payment, PurchasePayment, Sale, Purchase, Return } = require("../../models");
const { getPayables } = require("../purchases/payablesService");
const { getReceivables } = require("../sales/receivables");
const { recalcPurchaseStatus } = require("../purchasePayments/purchasePaymentService");
const { getSaleBalance } = require("../payments/shared");
const { resolveSaleStatus, saleSettleTolerance } = require("../../utils/saleBalance");
const { assertWarehouseAccess } = require("../../middleware/auth");

const QT = Sequelize.QueryTypes;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const doc = (rif) => String(rif || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hoyCaracas = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DB_TIMEZONE || "America/Caracas" }).format(new Date());
const ficha = (c) => (c ? { id: c.id, name: c.name, rif: c.rif || null, type: c.type } : null);

// El contacto y su otra ficha (mismo RIF, el otro tipo).
async function pareja(req, contactoId) {
  const id = parseInt(contactoId, 10);
  if (!id) throw fail("Contacto inválido");
  const [contacto] = await sequelize.query(
    `SELECT id, name, rif, type, phone, address, notes, credit_days FROM customers WHERE id = :id AND company_id = :cid`,
    { replacements: { id, cid: req.company_id }, type: QT.SELECT }
  );
  if (!contacto) throw fail("Contacto no encontrado", 404);
  // Mismo criterio que Contactos (customerService, PAREJA_SQL): el RIF tal cual está guardado.
  let otra = null;
  if (doc(contacto.rif)) {
    [otra] = await sequelize.query(
      `SELECT id, name, rif, type FROM customers
        WHERE company_id = :cid AND id <> :id AND type <> :tipo AND rif = :rif
        ORDER BY id LIMIT 1`,
      { replacements: { cid: req.company_id, id, tipo: contacto.type, rif: contacto.rif }, type: QT.SELECT }
    );
  }
  const esProveedor = contacto.type === "proveedor";
  return { contacto, proveedor: esProveedor ? contacto : otra || null, cliente: esProveedor ? otra || null : contacto };
}

async function historial(req, proveedorId) {
  return sequelize.query(
    `SELECT c.id, c.monto::float AS monto, c.notas, c.estado, c.created_at, c.anulado_at,
            e.full_name AS hecho_por, a.full_name AS anulado_por
       FROM cruces_cuentas c
       LEFT JOIN employees e ON e.id = c.employee_id
       LEFT JOIN employees a ON a.id = c.anulado_por
      WHERE c.company_id = :cid AND c.proveedor_id = :pid
      ORDER BY c.created_at DESC LIMIT 30`,
    { replacements: { cid: req.company_id, pid: proveedorId }, type: QT.SELECT }
  );
}

// Lo que hay de cada lado, con las mismas cifras de Contabilidad, Cuentas (por pagar y por
// cobrar) y el mismo recorte de sucursal.
async function estado(req, contactoId) {
  const { contacto, proveedor, cliente } = await pareja(req, contactoId);
  const [pag, cob, cruces] = await Promise.all([
    proveedor ? getPayables({ supplier_id: proveedor.id }, req) : null,
    cliente ? getReceivables({ customer_id: cliente.id }, req) : null,
    proveedor && cliente ? historial(req, proveedor.id) : [],
  ]);
  const compras = (pag?.data.invoices || []).map(i => ({
    id: i.id, fecha: i.created_at, vence: i.due_date, dias_atraso: i.days_overdue,
    total: i.total, saldo: i.balance, sucursal: i.warehouse_name,
  }));
  const ventas = (cob?.data.invoices || []).map(i => ({
    id: i.id, numero: i.invoice_number, fecha: i.created_at, vence: i.due_date, dias_atraso: i.days_overdue,
    total: i.total, saldo: i.balance, sucursal: i.warehouse_name,
  }));
  const le_debo = r2(compras.reduce((t, c) => t + c.saldo, 0));
  const me_debe = r2(ventas.reduce((t, v) => t + v.saldo, 0));
  return {
    contacto: ficha(contacto), proveedor: ficha(proveedor), cliente: ficha(cliente),
    le_debo, me_debe, sugerido: proveedor && cliente ? r2(Math.min(le_debo, me_debe)) : 0,
    compras, ventas, cruces,
  };
}

// Registra la otra ficha del proveedor (la de cliente) con sus mismos datos, para venderle.
async function registrarComoCliente(req, contactoId) {
  const { contacto, cliente } = await pareja(req, contactoId);
  if (contacto.type !== "proveedor") throw fail("Este contacto ya es un cliente");
  if (cliente) return { cliente: ficha(cliente), creado: false };
  if (!doc(contacto.rif)) throw fail("El proveedor necesita RIF o cédula para registrarlo también como cliente");
  const nuevo = await Customer.create({
    company_id: req.company_id, type: "cliente", name: contacto.name, rif: contacto.rif,
    phone: contacto.phone || null, address: contacto.address || null,
    notes: "También es proveedor (cruce de cuentas).",
  });
  return { cliente: ficha(nuevo), creado: true };
}

// `compras` / `ventas`: los documentos que la tienda eligió cruzar (ids). Sin ellos, todos los
// pendientes. El monto se reparte de lo más viejo a lo más nuevo DENTRO de lo elegido.
async function cruzar(req, { contacto_id, monto, notas, compras, ventas }) {
  const st = await estado(req, contacto_id);
  if (!st.proveedor || !st.cliente) throw fail("Para cruzar cuentas el contacto tiene que estar registrado como proveedor y como cliente, con el mismo RIF.");
  const elegidos = (lista, ids, nombre) => {
    if (!Array.isArray(ids) || !ids.length) return lista;
    const set = new Set(ids.map(Number));
    const hay = lista.filter(d => set.has(d.id));
    if (hay.length !== set.size) throw fail(`Una de las ${nombre} que marcaste ya no está pendiente. Vuelve a abrir el cruce.`);
    return hay;
  };
  st.compras = elegidos(st.compras, compras, "compras");
  st.ventas = elegidos(st.ventas, ventas, "facturas");
  const enCompras = r2(st.compras.reduce((t, c) => t + c.saldo, 0));
  const enVentas = r2(st.ventas.reduce((t, v) => t + v.saldo, 0));
  const m = r2(parseFloat(String(monto ?? "").replace(",", ".")));
  if (!(m > 0)) throw fail("El monto del cruce tiene que ser mayor que cero");
  if (m > enCompras + 0.005) throw fail(`Las compras que se cruzan suman Ref. ${enCompras.toFixed(2)}: el cruce no puede ser mayor.`);
  if (m > enVentas + 0.005) throw fail(`Las facturas que se cruzan suman Ref. ${enVentas.toFixed(2)}: el cruce no puede ser mayor.`);
  const nota = String(notas || "").trim().slice(0, 300) || null;

  const t = await sequelize.transaction();
  try {
    const [[{ id }]] = await sequelize.query(
      `INSERT INTO cruces_cuentas (company_id, proveedor_id, cliente_id, monto, notas, employee_id)
       VALUES (:cid, :pid, :clid, :monto, :notas, :eid) RETURNING id`,
      { replacements: { cid: req.company_id, pid: st.proveedor.id, clid: st.cliente.id, monto: m, notas: nota, eid: req.employee?.id || null }, transaction: t }
    );
    const lote = `cruce:${id}`;
    const comun = {
      payment_journal_id: null, payment_method: "cruce", employee_id: req.employee?.id || null,
      reference_date: hoyCaracas(), reference_number: `Cruce #${id}`, batch_id: lote,
    };

    // Lo que la tienda le debe: de lo que vence primero a lo último (como el pago conjunto).
    let resto = m;
    for (const c of st.compras) {
      if (resto <= 0.001) break;
      const compra = await Purchase.findByPk(c.id, { transaction: t, lock: true });
      if (!compra) continue;
      await assertWarehouseAccess(req, compra.warehouse_id, { optional: true });
      const [{ pagado }] = await sequelize.query(
        `SELECT COALESCE(SUM(pp.amount), 0)::float AS pagado
           FROM purchase_payments pp
           LEFT JOIN expenses e ON e.reference = COALESCE('purchase_batch:' || pp.batch_id, 'purchase_payment:' || pp.id::text)
          WHERE pp.purchase_id = :id AND (e.status IS NULL OR e.status = 'activo')`,
        { replacements: { id: compra.id }, type: QT.SELECT, transaction: t }
      );
      const aplicar = r2(Math.min(resto, parseFloat(compra.total) - pagado));
      if (aplicar <= 0) continue;
      await PurchasePayment.create({
        ...comun, company_id: req.company_id, purchase_id: compra.id, amount: aplicar,
        currency_id: compra.currency_id || null, exchange_rate: compra.exchange_rate || 1,
        notes: `Cruce de cuentas: ${st.cliente.name} se llevó mercancía${nota ? ` · ${nota}` : ""}`,
      }, { transaction: t });
      await recalcPurchaseStatus(compra.id, t);
      resto = r2(resto - aplicar);
    }
    if (resto > 0.01) throw fail("Las compras de este proveedor cambiaron mientras cruzabas. Vuelve a abrir el cruce.");

    // Lo que él le debe a la tienda: igual, de lo más viejo a lo más nuevo.
    resto = m;
    for (const v of st.ventas) {
      if (resto <= 0.001) break;
      const venta = await Sale.findByPk(v.id, { transaction: t, lock: true });
      if (!venta || !["pendiente", "parcial"].includes(venta.status)) continue;
      await assertWarehouseAccess(req, venta.warehouse_id, { optional: true });
      const devuelto = parseFloat(await Return.sum("total", { where: { sale_id: venta.id, status: { [Sequelize.Op.ne]: "anulado" } }, transaction: t }) || 0);
      const saldo = parseFloat(venta.total) - (await getSaleBalance(venta.id, t)) - devuelto;
      const aplicar = r2(Math.min(resto, saldo));
      if (aplicar <= 0) continue;
      await Payment.create({
        ...comun, company_id: req.company_id, sale_id: venta.id, customer_id: st.cliente.id, amount: aplicar,
        currency_id: venta.currency_id || null, exchange_rate: venta.exchange_rate || 1,
        notes: `Cruce de cuentas con lo que se le debe como proveedor${nota ? ` · ${nota}` : ""}`,
      }, { transaction: t });
      // Mismo criterio de saldada que el cobro y quitar un cobro (utils/saleBalance).
      const cobrado = (await getSaleBalance(venta.id, t)) - parseFloat(venta.forgiven_amount || 0);
      const nuevo = resolveSaleStatus({
        saleTotal: venta.total, paid: cobrado, returned: devuelto,
        forgiven: venta.forgiven_amount, forgivenFx: venta.fx_forgiven, hasInvoice: !!venta.invoice_number,
        tolerance: await saleSettleTolerance(venta, t),
      });
      await venta.update({ status: nuevo }, { transaction: t });
      resto = r2(resto - aplicar);
    }
    if (resto > 0.01) throw fail("Las facturas de este cliente cambiaron mientras cruzabas. Vuelve a abrir el cruce.");

    await t.commit();
    return { cruce_id: id, ...(await estado(req, contacto_id)) };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function anular(req, cruceId) {
  const id = parseInt(cruceId, 10);
  const t = await sequelize.transaction();
  try {
    const [cruce] = await sequelize.query(
      `SELECT * FROM cruces_cuentas WHERE id = :id AND company_id = :cid FOR UPDATE`,
      { replacements: { id, cid: req.company_id }, type: QT.SELECT, transaction: t }
    );
    if (!cruce) throw fail("Cruce no encontrado", 404);
    if (cruce.estado === "anulado") throw fail("Este cruce ya estaba anulado");
    const lote = `cruce:${id}`;

    const pagosCompra = await PurchasePayment.findAll({ where: { batch_id: lote }, transaction: t, lock: true });
    const compras = await Purchase.findAll({ where: { id: [...new Set(pagosCompra.map(p => p.purchase_id))] }, transaction: t });
    for (const c of compras) await assertWarehouseAccess(req, c.warehouse_id, { optional: true });
    const pagosVenta = await Payment.findAll({ where: { batch_id: lote }, transaction: t, lock: true });
    const ventas = await Sale.findAll({ where: { id: [...new Set(pagosVenta.map(p => p.sale_id))] }, transaction: t, lock: true });
    for (const v of ventas) await assertWarehouseAccess(req, v.warehouse_id, { optional: true });

    await PurchasePayment.destroy({ where: { batch_id: lote }, transaction: t });
    await Payment.destroy({ where: { batch_id: lote }, transaction: t });
    for (const c of compras) await recalcPurchaseStatus(c.id, t);
    for (const venta of ventas) {
      if (venta.status === "anulado" || venta.status === "devuelto") continue;
      const devuelto = parseFloat(await Return.sum("total", { where: { sale_id: venta.id, status: { [Sequelize.Op.ne]: "anulado" } }, transaction: t }) || 0);
      const cobrado = (await getSaleBalance(venta.id, t)) - parseFloat(venta.forgiven_amount || 0);
      const nuevo = resolveSaleStatus({
        saleTotal: venta.total, paid: cobrado, returned: devuelto,
        forgiven: venta.forgiven_amount, forgivenFx: venta.fx_forgiven, hasInvoice: !!venta.invoice_number,
        tolerance: await saleSettleTolerance(venta, t),
      });
      await venta.update({ status: nuevo }, { transaction: t });
    }
    await sequelize.query(
      `UPDATE cruces_cuentas SET estado = 'anulado', anulado_por = :eid, anulado_at = NOW() WHERE id = :id`,
      { replacements: { id, eid: req.employee?.id || null }, transaction: t }
    );
    await t.commit();
    return { anulado: id };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// Todos los cruces de la empresa (Contabilidad → Cuentas → Cruces), con lo que saldó cada uno:
// las compras de un lado y las facturas del otro, por su lote 'cruce:<id>'.
async function listar(req, { desde, hasta, buscar, estado } = {}) {
  const f = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);
  const tz = process.env.DB_TIMEZONE || "America/Caracas";
  const filtros = [];
  const reps = { cid: req.company_id };
  if (f(desde)) { filtros.push(`(c.created_at AT TIME ZONE '${tz}')::date >= :desde`); reps.desde = desde; }
  if (f(hasta)) { filtros.push(`(c.created_at AT TIME ZONE '${tz}')::date <= :hasta`); reps.hasta = hasta; }
  if (["activo", "anulado"].includes(estado)) { filtros.push("c.estado = :estado"); reps.estado = estado; }
  const texto = String(buscar || "").trim();
  if (texto) {
    filtros.push(`(p.name ILIKE :t OR p.rif ILIKE :t OR c.notas ILIKE :t OR c.id::text = :n)`);
    reps.t = `%${texto.replace(/[%_]/g, "")}%`;
    reps.n = texto.replace(/\D/g, "") || "0";
  }
  const filas = await sequelize.query(
    `SELECT c.id, c.monto::float AS monto, c.notas, c.estado, c.created_at, c.anulado_at,
            c.proveedor_id, c.cliente_id, p.name AS contacto, p.rif,
            e.full_name AS hecho_por, a.full_name AS anulado_por
       FROM cruces_cuentas c
       JOIN customers p ON p.id = c.proveedor_id
       LEFT JOIN employees e ON e.id = c.employee_id
       LEFT JOIN employees a ON a.id = c.anulado_por
      WHERE c.company_id = :cid ${filtros.length ? `AND ${filtros.join(" AND ")}` : ""}
      ORDER BY c.created_at DESC LIMIT 300`,
    { replacements: reps, type: QT.SELECT }
  );
  const lotes = filas.filter(x => x.estado === "activo").map(x => `cruce:${x.id}`);
  const [compras, ventas] = lotes.length ? await Promise.all([
    sequelize.query(
      `SELECT pp.batch_id, pp.purchase_id AS id, pp.amount::float AS monto FROM purchase_payments pp
        WHERE pp.batch_id IN (:lotes) ORDER BY pp.id`, { replacements: { lotes }, type: QT.SELECT }),
    sequelize.query(
      `SELECT py.batch_id, s.id, s.invoice_number AS numero, py.amount::float AS monto
         FROM payments py JOIN sales s ON s.id = py.sale_id
        WHERE py.batch_id IN (:lotes) ORDER BY py.id`, { replacements: { lotes }, type: QT.SELECT }),
  ]) : [[], []];
  const activos = filas.filter(x => x.estado === "activo");
  return {
    resumen: { cruces: activos.length, total: r2(activos.reduce((t, x) => t + x.monto, 0)), anulados: filas.length - activos.length },
    cruces: filas.map(x => ({
      ...x,
      compras: compras.filter(c => c.batch_id === `cruce:${x.id}`).map(({ batch_id, ...c }) => c),   // eslint-disable-line no-unused-vars
      ventas: ventas.filter(v => v.batch_id === `cruce:${x.id}`).map(({ batch_id, ...v }) => v),       // eslint-disable-line no-unused-vars
    })),
  };
}

// Un pago que nació de un cruce no se borra suelto: dejaría el otro lado saldado sin respaldo.
const esDeCruce = (batchId) => String(batchId || "").startsWith("cruce:");
const ERROR_PAGO_DE_CRUCE = "Este pago es parte de un cruce de cuentas. Para deshacerlo, anula el cruce desde la ficha del contacto.";

module.exports = { estado, cruzar, anular, registrarComoCliente, listar, esDeCruce, ERROR_PAGO_DE_CRUCE };
