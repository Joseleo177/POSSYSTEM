const { Sale, Customer, sequelize, Sequelize } = require("../../models");
const { assertWarehouseAccess, visibleWarehouseIds } = require("../../middleware/auth");
const { dueDateSql, customerCreditDaysSql, TODAY_SQL, effectiveDueDate, parseDueDate, summarize, round, resolveCustomerCreditDays } = require("../../utils/dueDate");
const { PAYMENT_TOLERANCE } = require("../../utils/saleBalance");

// Vencimiento de una factura: el pactado a mano o, si no hay, su fecha más los días de
// crédito del cliente —los de su ficha si tiene una excepción, si no el plazo general de la
// empresa— (regla completa en utils/dueDate.js, la misma de Cuentas por Pagar).
const CREDIT_SQL = customerCreditDaysSql('c', 's');
const DUE_SQL = dueDateSql('s', CREDIT_SQL);

/**
 * Cuentas por cobrar: facturas emitidas con saldo, con su vencimiento y antigüedad.
 *
 * Solo 'pendiente' y 'parcial'. Un 'borrador' es una cuenta abierta del POS —una mesa, una
 * barra— que todavía no se cerró: no es una deuda pactada con nadie, y metida acá cada mesa
 * abierta aparecería como "vence hoy".
 *
 * El saldo es el mismo de la ficha de la venta: total − cobrado (pagos + crédito aplicado) −
 * devuelto con NC vigente − exonerado. Con la tolerancia de siempre (PAYMENT_TOLERANCE): una
 * factura pagada a tasa de efectivo deja centavos que no son deuda.
 */
async function getReceivables({ warehouse_id, customer_id, search }, req) {
  const company_id = req.employee?.company_id ?? null;
  const rep = {};
  const where = [];

  if (company_id) { where.push('s.company_id = :cid'); rep.cid = company_id; }

  // Mismo recorte que el resto de las ventas: las de sus sucursales; con una elegida, esa.
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    where.push('s.warehouse_id = :wid'); rep.wid = parseInt(warehouse_id);
  } else {
    const allowed = await visibleWarehouseIds(req);
    if (allowed) {
      const ids = allowed.filter(Number.isInteger);
      where.push(ids.length ? `s.warehouse_id IN (${ids.join(',')})` : 'FALSE');
    }
  }

  if (customer_id) { where.push('s.customer_id = :custid'); rep.custid = parseInt(customer_id); }
  if (search?.trim()) {
    rep.term = `%${search.trim()}%`;
    where.push(`(c.name ILIKE :term OR c.rif ILIKE :term OR s.invoice_number ILIKE :term)`);
  }

  const rows = await sequelize.query(
    `SELECT *
       FROM (
         SELECT s.id, s.invoice_number, s.customer_id, s.warehouse_id, s.status,
                s.total::float AS total, s.currency_id, s.exchange_rate::float AS exchange_rate,
                s.created_at, s.due_date AS due_date_fixed,
                s.forgiven_amount::float AS forgiven_amount,
                COALESCE(c.name, 'Sin cliente') AS customer_name,
                c.rif AS customer_rif, c.phone AS customer_phone,
                -- El plazo que aplica, y si sale del general (la ficha del cliente está vacía).
                ${CREDIT_SQL} AS credit_days,
                (c.credit_days IS NULL) AS credit_is_default,
                w.name AS warehouse_name,
                -- Neto del vuelto, con la misma regla de getSaleBalance
                (COALESCE((SELECT SUM(py.amount) - COALESCE(SUM(py.change_given) FILTER (WHERE py.change_journal_id IS NOT NULL), 0)
                             FROM payments py WHERE py.sale_id = s.id), 0)
                  + COALESCE(s.credit_applied, 0))::float AS amount_paid,
                COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id AND r.status <> 'anulado'), 0)::float AS total_returned,
                -- Como texto: un DATE crudo puede volver de pg como Date a medianoche UTC.
                to_char(${DUE_SQL}, 'YYYY-MM-DD') AS due_date,
                (${TODAY_SQL} - ${DUE_SQL})::int AS days_overdue
           FROM sales s
           LEFT JOIN customers  c ON c.id = s.customer_id
           LEFT JOIN warehouses w ON w.id = s.warehouse_id
          WHERE s.status IN ('pendiente', 'parcial')
            ${where.length ? `AND ${where.join(' AND ')}` : ''}
       ) x
      WHERE x.total - x.amount_paid - x.total_returned - x.forgiven_amount > ${PAYMENT_TOLERANCE}
      ORDER BY x.due_date ASC, x.id ASC`,
    { replacements: rep, type: Sequelize.QueryTypes.SELECT }
  );

  const invoices = rows.map(r => {
    const inv = {
      ...r,
      balance: round(r.total - r.amount_paid - r.total_returned - r.forgiven_amount),
      amount_paid: round(r.amount_paid),
      has_fixed_due: !!r.due_date_fixed,
    };
    delete inv.due_date_fixed;
    return inv;
  });

  const { summary, aging, contacts, due_soon_days } = summarize(invoices, {
    groupKey: r => r.customer_id ? `id:${r.customer_id}` : 'none',
    newGroup: r => ({
      customer_id: r.customer_id, customer_name: r.customer_name, customer_rif: r.customer_rif,
      customer_phone: r.customer_phone, credit_days: r.credit_days, credit_is_default: r.credit_is_default,
    }),
  });
  summary.customer_count = summary.contact_count;

  return { data: { summary, aging, customers: contacts, invoices, due_soon_days } };
}

// Fija (o quita, con null) el vencimiento pactado de una factura.
async function setSaleDueDate(id, { due_date }, req) {
  const sale = await Sale.findByPk(id);
  if (!sale) { const e = new Error("Venta no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

  const value = parseDueDate(due_date);
  await sale.update({ due_date: value });

  const cliente = sale.customer_id
    ? await Customer.findByPk(sale.customer_id, { attributes: ['credit_days'] })
    : null;
  const { days } = await resolveCustomerCreditDays(cliente, sale.company_id);
  return { id: sale.id, due_date: value, effective_due_date: effectiveDueDate(sale, days) };
}

module.exports = { getReceivables, setSaleDueDate };
