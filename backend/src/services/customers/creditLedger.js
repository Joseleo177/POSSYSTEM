const { CustomerCreditMovement, Customer, Sequelize } = require("../../models");
const { Op } = Sequelize;

// Cuánto crédito de este cliente se puede aplicar EN ESTA SUCURSAL: lo compartido (sin
// sucursal de origen conocida —incluye todo el histórico de antes de este ledger—) más lo
// que él mismo generó en esta sucursal. El crédito que generó en otra sucursal no cuenta:
// no entró por esta caja y no se puede explicar en su arqueo.
//
// Sin `warehouseId` (una pantalla que mira la empresa completa, o un ajuste manual) se
// devuelve solo lo compartido: ahí no hay una sucursal contra la que decidir qué cuenta.
async function creditAvailable(customerId, warehouseId, transaction) {
  const where = warehouseId
    ? { customer_id: customerId, [Op.or]: [{ warehouse_id: null }, { warehouse_id: parseInt(warehouseId) }] }
    : { customer_id: customerId, warehouse_id: null };
  const sum = await CustomerCreditMovement.sum('amount', { where, transaction });
  return parseFloat(sum || 0);
}

// Registra el movimiento (positivo = crédito generado, negativo = consumido o devuelto en
// efectivo) y mantiene `credit_balance` —el total en caché que se muestra sin tener que sumar
// el ledger completo— sincronizado con el mismo número.
async function addCreditMovement({ customer_id, warehouse_id = null, amount, reason, sale_id = null, return_id = null, employee_id = null, company_id = null }, transaction) {
  const amt = parseFloat(parseFloat(amount).toFixed(6));
  if (!amt) return;
  await CustomerCreditMovement.create({
    customer_id,
    warehouse_id: warehouse_id ? parseInt(warehouse_id) : null,
    amount: amt,
    reason,
    sale_id,
    return_id,
    employee_id,
    company_id,
  }, { transaction });
  await Customer.increment({ credit_balance: amt }, { where: { id: customer_id }, transaction });
}

module.exports = { creditAvailable, addCreditMovement };
