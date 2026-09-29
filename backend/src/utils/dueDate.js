'use strict';

// Vencimiento de un documento por cobrar o por pagar, y su antigüedad. Lo comparten Cuentas
// por Pagar (compras) y Cuentas por Cobrar (ventas): la regla tiene que ser la misma en los
// dos lados o los dos tableros dejarían de poder compararse.
//
// Regla: el vencimiento pactado a mano para ESE documento (`due_date`) o, si no hay, su fecha
// más los días de crédito del contacto. Se calcula al leer y no se congela al crear el
// documento: así los viejos quedan cubiertos sin migrar datos, y si se corrige el plazo de un
// contacto que se había cargado mal, sus documentos abiertos se corrigen solos.
//
// El día del documento se toma en hora local: una venta de las 9 PM en Caracas es de ese día,
// no del siguiente, que es lo que daría cortar el TIMESTAMPTZ en UTC.

const TZ = process.env.DB_TIMEZONE || 'America/Caracas';

// `doc`: alias de la tabla del documento (con due_date y created_at). `creditDaysSql`: la
// expresión de los días de crédito que aplican (ver customerCreditDaysSql para clientes).
const dueDateSql = (doc, creditDaysSql) =>
  `COALESCE(${doc}.due_date, (${doc}.created_at AT TIME ZONE '${TZ}')::date + ${creditDaysSql})`;

// Plazo general de crédito a clientes, configurado por empresa (Configuración → tope para
// exonerar y plazo de crédito). Vacío o inválido = de contado.
const CUSTOMER_CREDIT_SETTING = 'customer_credit_days';
const companyCustomerCreditSql = (companyIdSql) => `(
  SELECT CASE WHEN st.value ~ '^[0-9]+$' THEN st.value::int END
    FROM settings st
   WHERE st.key = '${CUSTOMER_CREDIT_SETTING}' AND st.company_id = ${companyIdSql})`;

// Días de crédito de un cliente: los suyos si tiene una excepción cargada (incluido 0 = de
// contado a propósito); si su ficha está vacía, el plazo general de la empresa.
const customerCreditDaysSql = (contact, doc) =>
  `COALESCE(${contact}.credit_days, ${companyCustomerCreditSql(`${doc}.company_id`)}, 0)`;

// Días de crédito de un proveedor: los de su ficha. No hay plazo general: cada proveedor da
// sus propias condiciones.
const supplierCreditDaysSql = (contact) => `COALESCE(${contact}.credit_days, 0)`;

// Plazo general de clientes de una empresa, para las fichas de un solo documento.
async function companyCustomerCreditDays(companyId) {
  if (!companyId) return 0;
  const { Setting } = require('../models');
  const row = await Setting.findOne({ where: { key: CUSTOMER_CREDIT_SETTING, company_id: companyId } });
  const v = String(row?.value ?? '').trim();
  return /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0;
}

// Plazo que aplica a un cliente, y si sale del general: la ficha dice "15 días (plazo general)".
async function resolveCustomerCreditDays(customer, companyId) {
  if (customer && customer.credit_days !== null && customer.credit_days !== undefined) {
    return { days: parseInt(customer.credit_days, 10) || 0, isDefault: false };
  }
  return { days: await companyCustomerCreditDays(companyId), isDefault: true };
}

const TODAY_SQL = `(NOW() AT TIME ZONE '${TZ}')::date`;

// La misma regla, para la ficha de un solo documento.
function effectiveDueDate(doc, creditDays) {
  if (doc.due_date) return doc.due_date;
  const local = new Date(new Date(doc.created_at).toLocaleString('en-US', { timeZone: TZ }));
  local.setDate(local.getDate() + (parseInt(creditDays) || 0));
  const pad = n => String(n).padStart(2, '0');
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

// Fecha 'YYYY-MM-DD' que llega del cliente, o null para quitar la pactada.
function parseDueDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) { const e = new Error("Fecha de vencimiento inválida"); e.status = 400; throw e; }
  return m[1];
}

// Tramos de antigüedad por días DESPUÉS del vencimiento, no desde la fecha del documento: una
// factura a 60 días con 45 de emitida está por vencer, no en el tramo de 31-60.
// "Por vencer" y no "Al día": esto último se leía como pagada, o como que vence hoy.
const BUCKETS = [
  { key: 'current',  label: 'Por vencer',  test: d => d <= 0 },
  { key: 'd1_30',    label: '1-30 días',   test: d => d >= 1  && d <= 30 },
  { key: 'd31_60',   label: '31-60 días',  test: d => d >= 31 && d <= 60 },
  { key: 'd61_90',   label: '61-90 días',  test: d => d >= 61 && d <= 90 },
  { key: 'd90_plus', label: 'Más de 90',   test: d => d > 90 },
];

// Lo que vence en esta ventana se muestra aparte: es lo que hay que tener listo.
const DUE_SOON_DAYS = 7;

const round = n => parseFloat((n || 0).toFixed(6));

/**
 * Totales, antigüedad y agrupación por contacto de una lista de documentos abiertos.
 *
 * `rows` vienen ordenadas por vencimiento y cada una trae `balance` y `days_overdue`.
 * `groupKey(row)` dice de qué contacto es; `newGroup(row)` arma su ficha inicial (con los
 * nombres de campo que espera cada pantalla).
 */
function summarize(rows, { groupKey, newGroup }) {
  const aging = Object.fromEntries(BUCKETS.map(b => [b.key, { label: b.label, count: 0, amount: 0 }]));
  const summary = {
    total_balance: 0, overdue_balance: 0, due_soon_balance: 0,
    invoice_count: 0, overdue_count: 0, due_soon_count: 0, contact_count: 0,
  };
  const groups = new Map();

  for (const r of rows) {
    const { balance, days_overdue: days } = r;
    summary.total_balance += balance;
    summary.invoice_count += 1;
    if (days > 0) { summary.overdue_balance += balance; summary.overdue_count += 1; }
    else if (days >= -DUE_SOON_DAYS) { summary.due_soon_balance += balance; summary.due_soon_count += 1; }

    const bucket = BUCKETS.find(b => b.test(days));
    aging[bucket.key].count  += 1;
    aging[bucket.key].amount += balance;

    const key = groupKey(r);
    if (!groups.has(key)) {
      groups.set(key, { ...newGroup(r), invoice_count: 0, balance: 0, overdue_balance: 0, max_days_overdue: null, next_due_date: null });
    }
    const g = groups.get(key);
    g.invoice_count += 1;
    g.balance += balance;
    if (days > 0) g.overdue_balance += balance;
    g.max_days_overdue = g.max_days_overdue === null ? days : Math.max(g.max_days_overdue, days);
    // Las filas vienen ordenadas por vencimiento: la primera de cada contacto es la próxima.
    if (!g.next_due_date) g.next_due_date = r.due_date;
  }

  const contacts = [...groups.values()]
    .map(g => ({ ...g, balance: round(g.balance), overdue_balance: round(g.overdue_balance) }))
    // Primero lo vencido y, dentro de eso, lo que más se debe: es el orden en que se atiende.
    .sort((a, b) => b.overdue_balance - a.overdue_balance || b.balance - a.balance);

  summary.contact_count    = contacts.length;
  summary.total_balance    = round(summary.total_balance);
  summary.overdue_balance  = round(summary.overdue_balance);
  summary.due_soon_balance = round(summary.due_soon_balance);
  Object.values(aging).forEach(a => { a.amount = round(a.amount); });

  return { summary, aging, contacts, due_soon_days: DUE_SOON_DAYS };
}

module.exports = {
  TZ, dueDateSql, TODAY_SQL, effectiveDueDate, parseDueDate, summarize, round, BUCKETS, DUE_SOON_DAYS,
  CUSTOMER_CREDIT_SETTING, companyCustomerCreditSql, customerCreditDaysSql, supplierCreditDaysSql,
  companyCustomerCreditDays, resolveCustomerCreditDays,
};
