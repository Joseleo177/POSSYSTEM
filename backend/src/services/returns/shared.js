const {
  Return, Expense, ExpenseCategory, PaymentJournal, Currency, Sequelize,
} = require("../../models");
const { getSaleBalance } = require("../payments/shared");
const { saleSettleTolerance, resolveSaleStatus } = require("../../utils/saleBalance");
const { addCreditMovement } = require("../customers/creditLedger");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");
const { resolveMethod } = require("../../utils/journalMethod");
const { toLocalDate } = require("../../utils/localDate");

const Op = Sequelize.Op;
const round6 = (n) => parseFloat(parseFloat(n || 0).toFixed(6));
const err = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * Filtro para que los conteos de mercancía devuelta ignoren las notas de crédito anuladas.
 *
 * Anular una NC significa que esa devolución nunca ocurrió: sus líneas no pueden seguir
 * contando como "ya devuelto", porque entonces esas unidades quedarían bloqueadas para
 * siempre —no se podrían devolver de verdad— y la factura seguiría figurando como devuelta.
 *
 * Devuelve un fragmento de `where` para ReturnItem, vacío cuando no hay ninguna anulada
 * (el caso normal), para no ensuciar la consulta con un NOT IN inútil.
 */
async function excludeAnnulledReturns(saleId, transaction) {
  const anuladas = await Return.findAll({
    where: { sale_id: saleId, status: "anulado" },
    attributes: ["id"],
    transaction,
  });
  return anuladas.length ? { return_id: { [Op.notIn]: anuladas.map((r) => r.id) } } : {};
}

// Lo devuelto en notas de crédito vivas de una factura, en moneda base.
async function liveReturnedTotal(saleId, transaction) {
  return round6(await Return.sum("total", {
    where: { sale_id: saleId, status: { [Op.ne]: "anulado" } },
    transaction,
  }) || 0);
}

/**
 * Lo que la factura todavía debe, ANTES de la devolución que se está registrando.
 *
 * Una nota de crédito sobre una factura a crédito rebaja primero esa deuda: es mercancía que
 * el cliente no se lleva, así que no la tiene que pagar. Solo lo que exceda la deuda es dinero
 * del cliente —ya cobrado— y se le devuelve como saldo a favor, en efectivo o no se le
 * devuelve (ver settleSurplus). Antes se acreditaba el total siempre, y en una factura con
 * saldo pendiente el cliente ganaba dos veces: la deuda bajaba (cuentas por cobrar ya restaba
 * las devoluciones) y además recibía el mismo monto a favor.
 *
 * Mismo criterio que getOneSale y cuentas por cobrar: total − lo devuelto − lo cobrado (neto
 * del vuelto, con crédito aplicado y lo exonerado). Lo que queda dentro del margen de redondeo
 * propio de la factura no es deuda.
 */
async function saleDebt(sale, transaction) {
  if (["pagado", "exonerado", "anulado", "devuelto"].includes(sale.status)) return 0;
  const cobrado = await getSaleBalance(sale.id, transaction);
  const devuelto = await liveReturnedTotal(sale.id, transaction);
  const deuda = round6(parseFloat(sale.total) - devuelto - cobrado);
  return deuda > await saleSettleTolerance(sale, transaction) ? deuda : 0;
}

/**
 * Recalcula el estado de la factura original después de registrar una devolución.
 *
 * Devuelta completa manda sobre todo lo demás. Si no, solo se recalculan las que siguen en
 * cuentas por cobrar: una NC que salda lo que faltaba la deja 'pagado'. Las ya cerradas
 * ('pagado', 'exonerado') o sin cerrar ('borrador', 'espera') las fija otro flujo.
 */
async function refreshSaleStatus(sale, { fullyReturned }, transaction) {
  if (fullyReturned) {
    await sale.update({ status: "devuelto" }, { transaction });
    return "devuelto";
  }
  if (!["pendiente", "parcial"].includes(sale.status)) return sale.status;
  const forgiven = parseFloat(sale.forgiven_amount || 0);
  const status = resolveSaleStatus({
    saleTotal: sale.total,
    // getSaleBalance ya suma lo exonerado; resolveSaleStatus lo quiere aparte.
    paid: (await getSaleBalance(sale.id, transaction)) - forgiven,
    returned: await liveReturnedTotal(sale.id, transaction),
    forgiven,
    hasInvoice: !!sale.invoice_number,
    tolerance: await saleSettleTolerance(sale, transaction),
  });
  await sale.update({ status }, { transaction });
  return status;
}

const SURPLUS_MODES = ["credito", "reembolso", "redondeo"];

/**
 * Qué se hace con lo que sobra de una devolución o de un cambio, una vez rebajada la deuda
 * de la factura (y, en un cambio, pagada la mercancía nueva). Lo decide el cajero:
 *
 *   · 'credito'   → saldo a favor del cliente, atado a la sucursal de la venta.
 *   · 'reembolso' → sale de una o varias cajas como egreso "Devolución de Crédito", igual que
 *                   el vuelto de un cobro. Si lo reembolsado no cubre todo, el resto queda a
 *                   favor del cliente; sin cliente, tiene que cubrirlo.
 *   · 'redondeo'  → no se devuelve: queda a favor de la tienda. Pensado para céntimos.
 *
 * Antes el cambio lo mandaba siempre al saldo a favor, y la devolución lo acreditaba entero
 * AUNQUE además lo reembolsara en efectivo: el cliente se quedaba con el dinero y con el
 * crédito.
 *
 * `refund.parts`: [{ journal_id, payment_method, amount (en la moneda de la caja), reference }].
 */
async function settleSurplus({ sale, surplus, mode, refund, ncNumber, returnId, employeeId }, transaction) {
  const result = { credited: 0, refunded: 0, kept: 0, expenseIds: [] };
  surplus = round6(surplus);
  if (surplus <= 0.001) return result;

  if (!SURPLUS_MODES.includes(mode)) throw err("Indica qué hacer con lo que sobra: saldo a favor, reembolso o no devolver");
  if (mode === "credito" && !sale.customer_id) {
    throw err("La venta no tiene cliente: lo que sobra no puede quedar a su favor. Reembólsalo o elige no devolverlo");
  }

  if (mode === "redondeo") {
    result.kept = surplus;
    return result;
  }

  if (mode === "reembolso") {
    const parts = (Array.isArray(refund?.parts) ? refund.parts : []).filter(p => p?.journal_id);
    if (!parts.length) throw err("Indica de qué caja sale el reembolso");

    // Cada tramo del reembolso sale de una caja de la sucursal de la venta (o compartida).
    await assertJournalsInWarehouse(parts.map(p => p.journal_id), sale.warehouse_id, transaction);

    // Categoría propia y estable, la misma que usa el reembolso desde la ficha del cliente.
    const [cat] = await ExpenseCategory.findOrCreate({
      where:    { name: "Devolución de Crédito" },
      defaults: { name: "Devolución de Crédito", active: true },
      transaction,
    });

    for (const part of parts) {
      const rawAmount = parseFloat(String(part.amount ?? "").replace(",", "."));
      if (isNaN(rawAmount) || rawAmount <= 0) throw err("El monto de cada tramo del reembolso debe ser mayor a 0");

      const journal = await PaymentJournal.findByPk(part.journal_id, {
        include: [{ model: Currency, attributes: ["id", "exchange_rate"], required: false }],
        transaction,
      });
      if (!journal) throw err("Método de reembolso no encontrado");
      // El método del tramo (la cuenta puede tener varios); sin él, el principal de la cuenta.
      const metodo = await resolveMethod(part.journal_id, part.payment_method, "out", { transaction });
      if (metodo !== "efectivo" && !String(part.reference || "").trim()) {
        throw err("El número de referencia es obligatorio para este método de reembolso");
      }

      // El monto se teclea en la moneda del diario; se guarda en la base con 6 decimales,
      // igual que los cobros y el reembolso desde la ficha del cliente. Redondear a 4 (o a 2)
      // hacía que al reconstruir el bolívar diera 1.200,02 en vez de 1.200,00.
      const rate       = parseFloat(journal.Currency?.exchange_rate || 1) || 1;
      const baseAmount = round6(rawAmount / rate);

      const expense = await Expense.create({
        description:        `Reembolso ${ncNumber} / ${sale.invoice_number || "#" + sale.id}`,
        amount:             baseAmount,
        rate,
        category_id:        cat.id,
        payment_journal_id: parseInt(part.journal_id),
        payment_method:     metodo,
        currency_id:        journal.currency_id || null,
        reference:          String(part.reference || "").trim() || null,
        notes:              String(refund.notes || "").trim() || null,
        employee_id:        employeeId || null,
        warehouse_id:       sale.warehouse_id,
        company_id:         sale.company_id || null,
        status:             "activo",
        date:               refund.date ? toLocalDate(refund.date) : new Date(),
      }, { transaction });
      result.expenseIds.push(expense.id);
      result.refunded = round6(result.refunded + baseAmount);
    }

    // Un céntimo de holgura: el monto se teclea en la moneda de la caja con dos decimales.
    if (result.refunded > surplus + 0.01) {
      throw err(`El reembolso supera lo que le corresponde al cliente (${surplus.toFixed(2)})`);
    }
  }

  // Lo que no salió de caja queda a favor del cliente. Al reembolsar, un resto de céntimos
  // (la conversión a la moneda de la caja) no se le acredita.
  const resto = round6(surplus - result.refunded);
  if (mode === "credito" || resto > 0.01) {
    if (!sale.customer_id) {
      throw err(`Faltan ${resto.toFixed(2)} por reembolsar: sin cliente no pueden quedar a su favor`);
    }
    await addCreditMovement({
      customer_id:  sale.customer_id,
      warehouse_id: sale.warehouse_id,
      amount:       resto,
      reason:       "devolucion",
      sale_id:      sale.id,
      return_id:    returnId,
      employee_id:  employeeId || null,
      company_id:   sale.company_id || null,
    }, transaction);
    result.credited = resto;
  } else {
    result.kept = Math.max(0, resto);
  }
  return result;
}

// Sin `surplus_mode` (un cliente viejo del API): lo que hacía antes, sin el doble crédito.
function defaultSurplusMode({ refund, customerId }) {
  if (refund && refund.enabled !== false && Array.isArray(refund.parts) && refund.parts.some(p => p?.journal_id)) return "reembolso";
  return customerId ? "credito" : "redondeo";
}

module.exports = {
  excludeAnnulledReturns,
  liveReturnedTotal,
  saleDebt,
  refreshSaleStatus,
  settleSurplus,
  defaultSurplusMode,
};
