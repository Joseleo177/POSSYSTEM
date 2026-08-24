const { Sale, Payment, Return, Setting, Sequelize, sequelize } = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { PAYMENT_TOLERANCE, resolveSaleStatus } = require("../../utils/saleBalance");

const { Op } = Sequelize;

// Tope en moneda base para quien NO es administrador. Vacío o 0 = sin tope: el control queda
// en a quién se le da el permiso 'sales.forgive'.
const LIMIT_SETTING_KEY = "forgive_limit";

const err = (message, status = 400) =>
  Object.assign(new Error(message), { status, isOperational: true });

const isAdmin = (req) => !!(req?.is_superuser || req?.employee?.permissions?.all);

async function forgiveLimitFor(company_id) {
  const row = await Setting.findOne({ where: { key: LIMIT_SETTING_KEY, company_id } });
  const limit = parseFloat(row?.value || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

// Cuánto le queda por cobrar a la factura, con el mismo criterio que usan cobrar y quitar un
// pago: total − devoluciones vivas − (cobrado − vuelto + crédito aplicado + ya exonerado).
async function pendingOf(sale, transaction) {
  const paid = parseFloat(await Payment.sum("amount", {
    where: { sale_id: sale.id, amount: { [Op.gt]: 0 } }, transaction,
  }) || 0);
  const changeGiven = parseFloat(await Payment.sum("change_given", {
    where: { sale_id: sale.id, change_journal_id: { [Op.not]: null } }, transaction,
  }) || 0);
  const returned = parseFloat(await Return.sum("total", {
    where: { sale_id: sale.id, status: { [Op.ne]: "anulado" } }, transaction,
  }) || 0);

  const total = parseFloat(sale.total || 0);
  const credited = paid - changeGiven
    + parseFloat(sale.credit_applied || 0)
    + parseFloat(sale.forgiven_amount || 0);

  return {
    paid: paid - changeGiven,
    returned,
    pending: parseFloat((Math.max(0, total - returned) - credited).toFixed(6)),
  };
}

/**
 * Exonera el saldo que queda por cobrar de una factura.
 *
 * Perdona SIEMPRE el saldo completo: los dos casos reales —"esta factura del empleado va por
 * cuenta de la casa" y "me quedó debiendo treinta céntimos, déjalo así"— son el mismo gesto,
 * cerrar la cuenta sin dinero. Una exoneración parcial dejaría la factura igual de abierta y
 * sin nadie a quien cobrarle el resto.
 *
 * No toca inventario (la mercancía salió y no vuelve), no acredita saldo a favor del cliente y
 * no crea un Payment: ese dinero nunca entró a caja. Solo queda anotado en la venta, con quién
 * lo autorizó y por qué.
 */
async function forgiveSale(id, { reason, employee_id }, req) {
  const motivo = String(reason || "").trim();
  if (!motivo) throw err("Indica el motivo de la exoneración");
  if (motivo.length > 300) throw err("El motivo no puede pasar de 300 caracteres");

  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(id, { transaction: t, lock: true });
    if (!sale) throw err("Factura no encontrada", 404);
    // Se perdona lo facturado en una sucursal propia.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    if (sale.status === "exonerado") throw err("Esta factura ya fue exonerada");
    if (sale.status === "pagado")    throw err("Esta factura ya fue pagada: no hay saldo que exonerar");
    if (sale.status === "anulado")   throw err("Esta factura está anulada");
    if (sale.status === "devuelto")  throw err("Esta factura fue devuelta en su totalidad, no tiene saldo por cobrar");
    if (["espera", "pedido"].includes(sale.status)) {
      throw err("Una cuenta en espera todavía no es una factura: cóbrala o anúlala");
    }

    const { paid, returned, pending } = await pendingOf(sale, t);
    if (pending <= PAYMENT_TOLERANCE) throw err("Esta factura no tiene saldo pendiente");

    // El tope solo aplica a quien no es administrador: es la barandilla del cajero que cierra
    // un vuelto de céntimos, no un candado para el dueño.
    if (!isAdmin(req)) {
      const limit = await forgiveLimitFor(sale.company_id ?? req?.employee?.company_id ?? null);
      if (limit !== null && pending > limit) {
        throw err(
          `Solo puedes exonerar hasta ${limit.toFixed(2)} por factura. Esta debe ${pending.toFixed(2)}: pídelo a un administrador`,
          403
        );
      }
    }

    const forgiven = parseFloat((parseFloat(sale.forgiven_amount || 0) + pending).toFixed(6));
    const status = resolveSaleStatus({
      saleTotal: sale.total,
      paid,
      returned,
      forgiven,
      hasInvoice: !!sale.invoice_number,
    });

    await sale.update({
      forgiven_amount: forgiven,
      forgiven_reason: motivo,
      forgiven_by: employee_id || null,
      forgiven_at: new Date(),
      status,
    }, { transaction: t });

    await t.commit();
    return {
      sale_id: sale.id,
      invoice_number: sale.invoice_number || null,
      forgiven_amount: forgiven,
      forgiven_now: pending,
      sale_status: status,
      // Mismos campos que devuelve un cobro: la pantalla post-venta refresca el resumen con
      // esta respuesta sin tener que distinguir de dónde vino. `amount_paid` es dinero real.
      amount_paid: parseFloat(paid.toFixed(6)),
      balance: 0,
    };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Deshace la exoneración: la factura vuelve a deberse. Para el perdón dado por error, o para
 * el empleado que después decide pagar.
 */
async function unforgiveSale(id, req) {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(id, { transaction: t, lock: true });
    if (!sale) throw err("Factura no encontrada", 404);
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    if (parseFloat(sale.forgiven_amount || 0) <= 0) throw err("Esta factura no tiene saldo exonerado");
    // Revertir el perdón sobre una factura ya anulada o devuelta la reviviría como deuda.
    if (["anulado", "devuelto"].includes(sale.status)) {
      throw err("Esta factura ya está cerrada por otro flujo");
    }

    // Con forgiven en 0, el saldo perdonado vuelve a ser saldo por cobrar.
    const { paid, returned } = await pendingOf(sale, t);
    const status = resolveSaleStatus({
      saleTotal: sale.total,
      paid,
      returned,
      forgiven: 0,
      hasInvoice: !!sale.invoice_number,
    });

    await sale.update({
      forgiven_amount: 0,
      forgiven_reason: null,
      forgiven_by: null,
      forgiven_at: null,
      status,
    }, { transaction: t });

    await t.commit();
    return { sale_id: sale.id, sale_status: status };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

module.exports = { forgiveSale, unforgiveSale, LIMIT_SETTING_KEY };
