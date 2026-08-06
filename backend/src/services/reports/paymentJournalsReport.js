const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate } = require("./shared");

// Cobros por día y por diario de pago.
//
// El Estado de Cuenta de Contabilidad agrupa los diarios por banco, así que con dos diarios
// del mismo banco (un punto de venta y un pago móvil, por ejemplo) sus montos quedan sumados
// sin forma de separarlos. Aquí cada diario es su propia columna.
//
// Solo cuenta cobros de ventas: no incluye ingresos ni egresos manuales, a diferencia del
// Estado de Cuenta. Es a propósito —responde "cuánto entró por cada método"— pero explica por
// qué los totales pueden no coincidir con aquella pantalla.
//
// Sobre los montos: payments.amount está en moneda base y exchange_rate es la tasa aplicada,
// de modo que amount * exchange_rate devuelve el monto en la moneda del diario. Se publican
// los dos: el original es el que el cajero contó, el base es el único que se puede sumar
// entre diarios de distinta moneda.
async function paymentJournalsReport({ date_from, date_to, company_id }) {
  const from = sanitizeDate(date_from);
  const to   = sanitizeDate(date_to);

  const rep = { cid: company_id };
  const scoped = !!company_id;

  // Las fechas se agrupan en hora de Caracas: en UTC, un cobro de las 8 de la noche cae al
  // día siguiente y el cuadre diario no coincidiría con el turno de caja.
  const TZ = "America/Caracas";
  const parts = [];
  if (from) parts.push(`AND (p.created_at AT TIME ZONE '${TZ}')::date >= :dfrom`);
  if (to)   parts.push(`AND (p.created_at AT TIME ZONE '${TZ}')::date <= :dto`);
  if (from) rep.dfrom = from;
  if (to)   rep.dto   = to;
  const dateClause = parts.join(" ");

  const rows = await sequelize.query(
    `SELECT (p.created_at AT TIME ZONE '${TZ}')::date            AS day,
            p.payment_journal_id                                  AS journal_id,
            COUNT(p.id)::int                                      AS tx_count,
            COALESCE(SUM(p.amount * COALESCE(p.exchange_rate, 1)), 0)::float AS amount_journal,
            COALESCE(SUM(p.amount), 0)::float                      AS amount_base
       FROM payments p
       LEFT JOIN sales s ON s.id = p.sale_id
      WHERE p.payment_journal_id IS NOT NULL
        ${scoped ? "AND p.company_id = :cid" : ""}
        ${dateClause}
      GROUP BY day, p.payment_journal_id
      ORDER BY day DESC`,
    { replacements: rep, type: Sequelize.QueryTypes.SELECT }
  );

  // Solo los diarios que tuvieron movimiento en el rango: una columna vacía en todas las
  // filas no aporta nada y ensancha la tabla.
  const usedIds = [...new Set(rows.map(r => r.journal_id))];
  const journals = usedIds.length
    ? await sequelize.query(
        `SELECT pj.id, pj.name, pj.color, pj.type,
                COALESCE(c.symbol, 'Ref.') AS currency_symbol,
                COALESCE(c.is_base, true)  AS is_base,
                b.name                     AS bank_name
           FROM payment_journals pj
           LEFT JOIN currencies c ON c.id = pj.currency_id
           LEFT JOIN banks b      ON b.id = pj.bank_id
          WHERE pj.id IN (:ids)
          ORDER BY pj.sort_order ASC, pj.id ASC`,
        { replacements: { ids: usedIds }, type: Sequelize.QueryTypes.SELECT }
      )
    : [];

  // Se arma una fila por día con una celda por diario. El total del día va en moneda base
  // porque es lo único sumable cuando hay diarios en monedas distintas.
  const byDay = new Map();
  for (const r of rows) {
    const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { date: key, cells: {}, total_base: 0, tx_count: 0 });
    const day = byDay.get(key);
    day.cells[r.journal_id] = {
      amount_journal: r.amount_journal,
      amount_base:    r.amount_base,
      tx_count:       r.tx_count,
    };
    day.total_base += r.amount_base;
    day.tx_count   += r.tx_count;
  }

  const totals = { cells: {}, total_base: 0, tx_count: 0 };
  for (const r of rows) {
    const cell = totals.cells[r.journal_id] || (totals.cells[r.journal_id] = { amount_journal: 0, amount_base: 0, tx_count: 0 });
    cell.amount_journal += r.amount_journal;
    cell.amount_base    += r.amount_base;
    cell.tx_count       += r.tx_count;
    totals.total_base   += r.amount_base;
    totals.tx_count     += r.tx_count;
  }

  return {
    journals,
    days: [...byDay.values()],
    totals,
  };
}

module.exports = paymentJournalsReport;