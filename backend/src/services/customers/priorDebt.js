const { sequelize, Customer, Sale, Currency, Warehouse } = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { zonedInstant, TIMEZONE } = require("../../utils/localDate");

/**
 * Deuda anterior: lo que el cliente debía antes de usar el sistema (el cuaderno del fiado).
 *
 * Se guarda como una venta SIN líneas con `is_prior_debt`, en estado 'pendiente'. Así se cobra,
 * se abona (también en un cobro conjunto), se exonera y aparece en Cuentas por cobrar, Cobranza,
 * la ficha y el aviso de deuda de la caja sin que ninguno de esos caminos tenga que conocerla.
 *
 * Lo que la separa de una venta:
 *  - No consume correlativo fiscal: su referencia es DA-<id>, única por construcción.
 *  - No mueve inventario (no tiene líneas) y no tiene vendedor, así que no paga comisión.
 *  - Queda fuera de lo vendido, la rentabilidad, el libro de ventas y el turno de caja: cada
 *    consulta de facturación filtra `is_prior_debt IS NOT TRUE`. Lo que SÍ cuenta es el dinero
 *    con que se cobra, que entra por `payments` como cualquier cobro.
 *  - La fecha es la del cuaderno: de ella salen el vencimiento y la antigüedad.
 *
 * Siempre en moneda base ($). Si se anotó en bolívares, la pantalla convierte y deja el monto
 * en Bs y la tasa en la nota.
 */
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const hoyLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });

async function createPriorDebt(customerId, { amount, date, note, warehouse_id }, req) {
  const monto = Math.round(parseFloat(String(amount ?? "").replace(",", ".")) * 100) / 100;
  if (!(monto > 0)) throw fail("El monto debe ser mayor a cero");

  const dia = String(date || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw fail("Indica la fecha de la deuda");
  const hoy = hoyLocal();
  if (dia > hoy) throw fail("La fecha no puede ser posterior a hoy");
  if (dia < "2000-01-01") throw fail("Revisa la fecha de la deuda");

  const nota = String(note || "").trim().slice(0, 300) || null;

  const wid = parseInt(warehouse_id);
  if (!wid) throw fail("Indica la sucursal de la deuda");
  // La deuda se cobra y se ve desde una sucursal: tiene que ser una de quien la carga.
  await assertWarehouseAccess(req, wid);
  const warehouse = await Warehouse.findByPk(wid, { attributes: ["id", "sells"] });
  if (!warehouse) throw fail("Sucursal no encontrada", 404);
  if (warehouse.sells === false) throw fail("Un depósito no maneja cuentas de clientes: elige una sucursal");

  const customer = await Customer.findByPk(customerId, { attributes: ["id", "type"] });
  if (!customer) throw fail("Cliente no encontrado", 404);
  if (customer.type === "proveedor") throw fail("Las deudas anteriores son de clientes, no de proveedores");

  const base = await Currency.findOne({ where: { is_base: true }, attributes: ["id"] });

  // Hoy: la hora real. Un día pasado: mediodía de ese día en la zona de operación, lejos de
  // la medianoche para que ningún corte por día la mueva al anterior o al siguiente.
  const createdAt = dia === hoy ? new Date() : zonedInstant(+m[1], +m[2], +m[3], 12, 0, 0);

  return sequelize.transaction(async (transaction) => {
    const sale = await Sale.create({
      total:           monto,
      paid:            0,
      change:          0,
      customer_id:     customer.id,
      employee_id:     req.employee?.id ?? null,
      currency_id:     base?.id ?? null,
      exchange_rate:   1,
      warehouse_id:    wid,
      company_id:      req.employee?.company_id ?? null,
      status:          "pendiente",
      is_prior_debt:   true,
      prior_debt_note: nota,
      created_at:      createdAt,
    }, { transaction });

    await sale.update({ invoice_number: `DA-${String(sale.id).padStart(6, "0")}` }, { transaction });
    return { sale: sale.toJSON() };
  });
}

module.exports = { createPriorDebt };
