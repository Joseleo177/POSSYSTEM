'use strict';

// Estado de cuenta de un contacto (Contactos → ficha → Excel). Reemplaza al CSV que solo
// volcaba la página visible con el id interno de cada venta (23-11-2026: "no me sirve de nada").
//
// Por documento, no como libro con saldo corrido: el saldo a favor que deja una nota de crédito
// y que después se aplica en otra factura se contaría dos veces en un saldo corrido. Cada
// documento lleva su cargo, cada abono que lo fue bajando (cobro con su caja y método, saldo a
// favor, nota de crédito, exoneración, cruce de cuentas) y lo que queda. El saldo de cada uno es
// el de Contabilidad → Cuentas (total − cobrado neto del vuelto − saldo a favor − NC vigentes −
// exonerado); lo que pasó de cero quedó como saldo a favor del cliente, que va aparte.

const { sequelize, Sequelize, Customer, Company } = require("../../models");
const { scopeWarehouseIds, assertWarehouseAccess } = require("../../middleware/auth");
const { getReceivables } = require("../sales/receivables");
const { getPayables } = require("../purchases/payablesService");

const QT = Sequelize.QueryTypes;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MAX_DOCS = 3000;

async function alcance(req, warehouse_id, alias) {
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    return `AND ${alias}.warehouse_id = ${parseInt(warehouse_id, 10)}`;
  }
  const ids = await scopeWarehouseIds(req, { includeDeposits: true });
  if (!Array.isArray(ids)) return "";
  const lista = ids.filter(Number.isInteger);
  return lista.length ? `AND ${alias}.warehouse_id IN (${lista.join(",")})` : "AND FALSE";
}

// "Cobro · Caja Bs · Pago móvil · Ref. 1234" / "Cruce de cuentas #3".
function conceptoPago(p, verbo) {
  if (p.payment_method === "cruce") return `Cruce de cuentas${p.batch_id ? ` #${String(p.batch_id).slice(6)}` : ""}`;
  // El método solo si agrega algo: "Efectivo Bs · Efectivo" repite lo mismo.
  const repetido = p.metodo && p.caja && p.caja.toLowerCase().includes(p.metodo.toLowerCase());
  const partes = [verbo, p.caja, p.metodo && !repetido ? p.metodo : null].filter(Boolean);
  return partes.join(" · ");
}

async function estadoCliente(cliente, req, wh) {
  const ventas = await sequelize.query(
    `SELECT s.id, s.invoice_number, s.created_at, s.total::float AS total, s.status, s.is_prior_debt,
            COALESCE(s.credit_applied, 0)::float AS credit_applied,
            COALESCE(s.forgiven_amount, 0)::float AS forgiven_amount, s.forgiven_at, w.name AS sucursal
       FROM sales s LEFT JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.customer_id = :id AND s.company_id = :cid
        AND s.status IN ('pendiente', 'parcial', 'pagado', 'exonerado', 'devuelto') ${wh}
      ORDER BY s.created_at, s.id LIMIT ${MAX_DOCS}`,
    { replacements: { id: cliente.id, cid: cliente.company_id }, type: QT.SELECT }
  );
  const ids = ventas.map(v => v.id);
  const [pagos, notas] = ids.length ? await Promise.all([
    sequelize.query(
      `SELECT p.sale_id, p.created_at, p.payment_method, p.batch_id, p.reference_number,
              (p.amount - CASE WHEN p.change_journal_id IS NOT NULL THEN COALESCE(p.change_given, 0) ELSE 0 END)::float AS monto,
              pj.name AS caja, pm.name AS metodo
         FROM payments p
         LEFT JOIN payment_journals pj ON pj.id = p.payment_journal_id
         LEFT JOIN payment_methods pm ON pm.code = p.payment_method AND pm.company_id = p.company_id
        WHERE p.sale_id IN (:ids) AND p.amount > 0
        ORDER BY p.created_at, p.id`,
      { replacements: { ids }, type: QT.SELECT }),
    sequelize.query(
      `SELECT sale_id, created_at, nc_number, total::float AS total FROM returns
        WHERE sale_id IN (:ids) AND status <> 'anulado' ORDER BY created_at, id`,
      { replacements: { ids }, type: QT.SELECT }),
  ]) : [[], []];

  const documentos = ventas.map(v => {
    const movimientos = [
      ...(v.credit_applied > 0 ? [{ fecha: v.created_at, concepto: "Saldo a favor aplicado", monto: v.credit_applied }] : []),
      ...pagos.filter(p => p.sale_id === v.id).map(p => ({
        fecha: p.created_at, concepto: conceptoPago(p, "Cobro"), referencia: p.reference_number || null, monto: r2(p.monto),
      })),
      ...notas.filter(n => n.sale_id === v.id).map(n => ({ fecha: n.created_at, concepto: `Nota de crédito ${n.nc_number || ""}`.trim(), monto: n.total })),
      ...(v.forgiven_amount > 0 ? [{ fecha: v.forgiven_at || v.created_at, concepto: "Exonerado", monto: v.forgiven_amount }] : []),
    ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const abonado = movimientos.reduce((t, m) => t + m.monto, 0);
    const resto = r2(v.total - abonado);
    return {
      id: v.id, documento: v.invoice_number || `Venta #${v.id}`,
      concepto: v.is_prior_debt ? "Deuda anterior" : v.status === "devuelto" ? "Venta (devuelta)" : "Venta",
      fecha: v.created_at, sucursal: v.sucursal, cargo: r2(v.total), movimientos,
      abonado: r2(abonado), saldo: Math.max(0, resto), a_favor: resto < -0.005 ? r2(-resto) : 0, estado: v.status,
    };
  });

  // Vencimiento de lo que se debe, con la misma regla de Contabilidad → Cuentas.
  const { data } = await getReceivables({ customer_id: cliente.id }, req);
  const abiertas = new Map(data.invoices.map(i => [i.id, i]));
  for (const d of documentos) {
    const a = abiertas.get(d.id);
    if (a) { d.vence = a.due_date; d.dias_vencida = a.days_overdue > 0 ? a.days_overdue : 0; d.saldo = r2(a.balance); }
    else if (d.estado !== "pendiente" && d.estado !== "parcial") d.saldo = 0;
  }
  return documentos;
}

async function estadoProveedor(proveedor, req, wh) {
  const compras = await sequelize.query(
    `SELECT p.id, p.created_at, p.total::float AS total, p.payment_status, p.supplier_invoice_number, w.name AS sucursal
       FROM purchases p LEFT JOIN warehouses w ON w.id = p.warehouse_id
      WHERE p.supplier_id = :id AND p.company_id = :cid AND p.status <> 'borrador' ${wh}
      ORDER BY p.created_at, p.id LIMIT ${MAX_DOCS}`,
    { replacements: { id: proveedor.id, cid: proveedor.company_id }, type: QT.SELECT }
  );
  const ids = compras.map(c => c.id);
  const pagos = ids.length ? await sequelize.query(
    `SELECT pp.purchase_id, pp.created_at, pp.payment_method, pp.batch_id, pp.reference_number, pp.amount::float AS monto,
            pj.name AS caja, pm.name AS metodo
       FROM purchase_payments pp
       LEFT JOIN expenses e ON e.reference = COALESCE('purchase_batch:' || pp.batch_id, 'purchase_payment:' || pp.id::text)
       LEFT JOIN payment_journals pj ON pj.id = pp.payment_journal_id
       LEFT JOIN payment_methods pm ON pm.code = pp.payment_method AND pm.company_id = pp.company_id
      WHERE pp.purchase_id IN (:ids) AND (e.status IS NULL OR e.status = 'activo')
      ORDER BY pp.created_at, pp.id`,
    { replacements: { ids }, type: QT.SELECT }
  ) : [];
  const { data } = await getPayables({ supplier_id: proveedor.id }, req);
  const abiertas = new Map(data.invoices.map(i => [i.id, i]));
  return compras.map(c => {
    const movimientos = pagos.filter(p => p.purchase_id === c.id).map(p => ({
      fecha: p.created_at, concepto: conceptoPago(p, "Pago"), referencia: p.reference_number || null, monto: p.monto,
    }));
    const abonado = movimientos.reduce((t, m) => t + m.monto, 0);
    const a = abiertas.get(c.id);
    return {
      id: c.id, documento: `Compra #${c.id}`,
      concepto: c.supplier_invoice_number ? `Compra · factura ${c.supplier_invoice_number}` : "Compra",
      fecha: c.created_at, sucursal: c.sucursal, cargo: r2(c.total), movimientos, abonado: r2(abonado),
      saldo: a ? r2(a.balance) : Math.max(0, r2(c.total - abonado)), a_favor: 0, estado: c.payment_status,
      vence: a?.due_date || null, dias_vencida: a && a.days_overdue > 0 ? a.days_overdue : 0,
    };
  });
}

async function estadoDeCuenta(id, { warehouse_id } = {}, req) {
  const contacto = await Customer.findByPk(id, {
    attributes: ["id", "name", "rif", "phone", "email", "address", "type", "company_id", "credit_days", "credit_balance"],
  });
  if (!contacto) { const e = new Error("Contacto no encontrado"); e.status = 404; throw e; }
  const esProveedor = contacto.type === "proveedor";
  const wh = await alcance(req, warehouse_id, esProveedor ? "p" : "s");
  const documentos = esProveedor ? await estadoProveedor(contacto, req, wh) : await estadoCliente(contacto, req, wh);
  const empresa = await Company.findByPk(contacto.company_id, { attributes: ["name", "tax_id", "phone", "address", "logo_url"] }).catch(() => null);

  const pendientes = documentos.filter(d => d.saldo > 0.005);
  return {
    data: {
      empresa: empresa ? {
        nombre: empresa.name, rif: empresa.tax_id || null, telefono: empresa.phone || null,
        direccion: empresa.address || null, logo_url: empresa.logo_url || null,
      } : null,
      contacto: {
        nombre: contacto.name, rif: contacto.rif, telefono: contacto.phone, correo: contacto.email,
        direccion: contacto.address, tipo: contacto.type, dias_credito: contacto.credit_days,
      },
      resumen: {
        documentos: documentos.length,
        total_cargos: r2(documentos.reduce((t, d) => t + d.cargo, 0)),
        total_abonos: r2(documentos.reduce((t, d) => t + d.abonado, 0)),
        saldo_pendiente: r2(pendientes.reduce((t, d) => t + d.saldo, 0)),
        vencido: r2(pendientes.filter(d => d.dias_vencida > 0).reduce((t, d) => t + d.saldo, 0)),
        saldo_a_favor: esProveedor ? 0 : r2(parseFloat(contacto.credit_balance || 0)),
        truncado: documentos.length >= MAX_DOCS,
      },
      documentos,
    },
  };
}

module.exports = { estadoDeCuenta };
