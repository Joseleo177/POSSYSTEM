const { Purchase, Customer, sequelize, Sequelize } = require("../../models");
const { assertWarehouseAccess, visibleWarehouseIds } = require("../../middleware/auth");
const { dueDateSql, supplierCreditDaysSql, TODAY_SQL, effectiveDueDate, parseDueDate, summarize, round } = require("../../utils/dueDate");

// Vencimiento de una compra: el pactado a mano para esa factura o, si no hay, la fecha de la
// compra más los días de crédito del proveedor (regla completa en utils/dueDate.js, la misma
// de Cuentas por Cobrar).
const DUE_SQL = dueDateSql('p', supplierCreditDaysSql('c'));

async function getPayables({ warehouse_id, supplier_id, search }, req) {
  const company_id = req.employee?.company_id ?? null;
  const rep = {};
  const where = [];

  // SQL crudo: el filtro por empresa de los hooks no llega hasta acá.
  if (company_id) { where.push('p.company_id = :cid'); rep.cid = company_id; }

  // Mismo recorte que el listado de compras: las de sus almacenes, más las órdenes sin
  // destino todavía, que no son de ninguna sucursal. Con sucursal elegida, solo esa.
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    where.push('p.warehouse_id = :wid'); rep.wid = parseInt(warehouse_id);
  } else {
    const allowed = await visibleWarehouseIds(req);
    if (allowed) {
      const ids = allowed.filter(Number.isInteger);
      where.push(ids.length ? `(p.warehouse_id IN (${ids.join(',')}) OR p.warehouse_id IS NULL)` : 'p.warehouse_id IS NULL');
    }
  }

  if (supplier_id) { where.push('p.supplier_id = :sid'); rep.sid = parseInt(supplier_id); }
  if (search?.trim()) {
    rep.term = `%${search.trim()}%`;
    const asInt = parseInt(search);
    where.push(`(c.name ILIKE :term OR c.rif ILIKE :term OR p.supplier_name ILIKE :term${!isNaN(asInt) ? ` OR p.id = ${asInt}` : ''})`);
  }

  // Un borrador todavía no le debe nada a nadie: es la lista de trabajo antes de decidir a
  // quién comprarle, y la compra no deja pagarlo. Lo pagado se cuenta igual que en el resto
  // del módulo: sin los pagos cuyo egreso se anuló.
  const rows = await sequelize.query(
    `SELECT *
       FROM (
         SELECT p.id, p.supplier_id, p.warehouse_id, p.status, p.payment_status,
                p.total::float AS total, p.currency_id, p.exchange_rate::float AS exchange_rate,
                p.created_at, p.due_date AS due_date_fixed,
                COALESCE(c.name, p.supplier_name, 'Sin proveedor') AS supplier_name,
                c.rif AS supplier_rif, c.credit_days,
                w.name AS warehouse_name,
                COALESCE((
                  SELECT SUM(pp.amount)
                    FROM purchase_payments pp
                    LEFT JOIN expenses e ON e.reference = COALESCE('purchase_batch:' || pp.batch_id, 'purchase_payment:' || pp.id::text)
                   WHERE pp.purchase_id = p.id
                     AND (e.status IS NULL OR e.status = 'activo')
                ), 0)::float AS amount_paid,
                -- Como texto: un DATE crudo puede volver de pg como Date a medianoche UTC, y en
                -- Caracas eso se pinta como el día anterior.
                to_char(${DUE_SQL}, 'YYYY-MM-DD') AS due_date,
                (${TODAY_SQL} - ${DUE_SQL})::int AS days_overdue
           FROM purchases p
           LEFT JOIN customers  c ON c.id = p.supplier_id
           LEFT JOIN warehouses w ON w.id = p.warehouse_id
          WHERE p.status <> 'borrador'
            AND p.payment_status IN ('pendiente', 'parcial')
            ${where.length ? `AND ${where.join(' AND ')}` : ''}
       ) x
      WHERE x.total - x.amount_paid > 0.01
      ORDER BY x.due_date ASC, x.id ASC`,
    { replacements: rep, type: Sequelize.QueryTypes.SELECT }
  );

  const invoices = rows.map(r => {
    const inv = { ...r, balance: round(r.total - r.amount_paid), amount_paid: round(r.amount_paid), has_fixed_due: !!r.due_date_fixed };
    delete inv.due_date_fixed;
    return inv;
  });

  const { summary, aging, contacts, due_soon_days } = summarize(invoices, {
    // Las compras cargadas solo con nombre (sin contacto) se agrupan por ese nombre: siguen
    // siendo deuda con alguien, aunque no tenga ficha.
    groupKey: r => r.supplier_id ? `id:${r.supplier_id}` : `name:${r.supplier_name}`,
    newGroup: r => ({ supplier_id: r.supplier_id, supplier_name: r.supplier_name, supplier_rif: r.supplier_rif, credit_days: r.credit_days }),
  });
  summary.supplier_count = summary.contact_count;

  return { data: { summary, aging, suppliers: contacts, invoices, due_soon_days } };
}

// Fija (o quita, con null) el vencimiento pactado de una compra. Se puede tocar en cualquier
// estado, incluso recibida: el plazo se renegocia justo cuando la factura ya está en la calle.
async function setDueDate(id, { due_date }, req) {
  const purchase = await Purchase.findByPk(id);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });

  const value = parseDueDate(due_date);
  await purchase.update({ due_date: value });

  const supplier = purchase.supplier_id
    ? await Customer.findByPk(purchase.supplier_id, { attributes: ['credit_days'] })
    : null;
  return { data: { id: purchase.id, due_date: value, effective_due_date: effectiveDueDate(purchase, supplier?.credit_days) } };
}

module.exports = { getPayables, setDueDate, effectiveDueDate };
