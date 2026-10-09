'use strict';

/**
 * Método de pago de un movimiento (payments, expenses, incomes, purchase_payments).
 *
 * Desde la migración journal-accounts el diario es la CUENTA ("Banco de Venezuela") y acepta
 * varios métodos, cada uno con su sentido (payment_journal_methods): el pago móvil cobra y
 * paga, el punto y el biopago solo cobran. Cada movimiento guarda por qué método entró o salió
 * el dinero, en `payment_method`. Sin eso no se distingue un cobro por punto de uno por pago
 * móvil en la misma cuenta, y la conciliación no reconoce los lotes del punto.
 *
 *   resolveMethod(journalId, requested, dir)
 *     · Con método pedido: debe ser de la cuenta y servir en ese sentido (si no, 400).
 *     · Sin método: el único que sirve en ese sentido; si hay varios, el primero por orden.
 *     · Una cuenta sin métodos cargados (datos viejos) cae al `type` del diario.
 *
 * `dir`: 'in' (entra dinero: cobro, ingreso) u 'out' (sale: egreso, vuelto, pago a proveedor).
 */

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

async function journalMethods(journalId, transaction) {
  const { sequelize } = require("../models");
  const rows = await sequelize.query(`
    SELECT pj.type, m.method_code, m.allows_inflow, m.allows_outflow, m.sort_order,
           pm.name AS method_name
      FROM payment_journals pj
      LEFT JOIN payment_journal_methods m ON m.journal_id = pj.id
      LEFT JOIN payment_methods pm ON pm.code = m.method_code AND pm.company_id = pj.company_id
     WHERE pj.id = :id
     ORDER BY m.sort_order, m.id
  `, { replacements: { id: journalId }, type: sequelize.QueryTypes.SELECT, transaction });
  if (!rows.length) return null;
  return {
    type: rows[0].type,
    methods: rows.filter(r => r.method_code).map(r => ({
      code: r.method_code, name: r.method_name || r.method_code,
      inflow: !!r.allows_inflow, outflow: !!r.allows_outflow,
    })),
  };
}

async function resolveMethod(journalId, requested, dir, { transaction, strict = true } = {}) {
  const pedido = requested ? String(requested).trim() : null;
  if (!journalId) return pedido;
  const info = await journalMethods(journalId, transaction);
  if (!info) return pedido;
  if (!info.methods.length) return pedido || info.type || null;

  const sirve = (m) => (dir === "out" ? m.outflow : m.inflow);
  if (pedido) {
    const m = info.methods.find(x => x.code === pedido);
    if (m && sirve(m)) return pedido;
    if (!strict) return pedido;
    if (!m) throw fail("Esa cuenta no acepta ese método de pago");
    throw fail(dir === "out" ? `Esa cuenta no paga por ${m.name}` : `Esa cuenta no recibe por ${m.name}`);
  }
  const utiles = info.methods.filter(sirve);
  return (utiles[0] || info.methods[0]).code;
}

// Hooks de respaldo: un movimiento que llega sin método toma el de su cuenta. Los caminos
// principales ya lo mandan validado; esto cubre los demás (vueltos, reintegros, canjes…) para
// que ninguno quede en blanco.
function installMethodHooks(models) {
  const sentido = {
    Payment: (row) => (parseFloat(row.amount) < 0 ? "out" : "in"),
    Expense: () => "out",
    Income: () => "in",
    PurchasePayment: () => "out",
  };
  // Al crear, si falta. Al editar, si cambió el diario y no el método: el método viejo era de
  // otra cuenta y ya no vale.
  const completar = async (row, campoDiario, campoMetodo, dir, options) => {
    const nuevo = row.isNewRecord !== false;
    if (!nuevo) {
      if (!row.changed(campoDiario) || row.changed(campoMetodo)) return;
      row.set(campoMetodo, null);
    }
    if (row.get(campoMetodo) || !row.get(campoDiario)) return;
    row.set(campoMetodo, await resolveMethod(row.get(campoDiario), null, dir, { transaction: options?.transaction, strict: false }));
    if (options?.fields && !options.fields.includes(campoMetodo)) options.fields.push(campoMetodo);
  };
  const fill = async (row, options) => {
    const dirOf = sentido[row.constructor.name];
    if (!dirOf) return;
    await completar(row, "payment_journal_id", "payment_method", dirOf(row), options);
    // El vuelto sale de su propia caja: su método es uno que pague.
    if (row.constructor.name === "Payment") {
      await completar(row, "change_journal_id", "change_payment_method", "out", options);
    }
  };
  for (const name of Object.keys(sentido)) {
    const Model = models[name];
    if (!Model) continue;
    Model.addHook("beforeSave", "fillPaymentMethod", fill);
    Model.addHook("beforeBulkCreate", "fillPaymentMethod", async (rows, options) => {
      for (const r of rows) await fill(r, options);
    });
  }
}

module.exports = { resolveMethod, journalMethods, installMethodHooks };
