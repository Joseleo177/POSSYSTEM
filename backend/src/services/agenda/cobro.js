'use strict';

const { Appointment, Sale, SaleItem, Customer, Serie, UserSerie, Sequelize } = require("../../models");
const { fail, int, alcance } = require("./shared");
const { olvidar } = require("../../utils/huella");

const { Op } = Sequelize;

// Cobro de una cita desde la agenda, sin pasar por la pantalla del POS.
//
// No es otro camino de facturación: la cuenta en espera que abrió terminar() se pasa a
// 'borrador' con updateSale —lo mismo que hace la caja al cobrar una cuenta en espera— y la
// pantalla la cobra con el mismo PaymentFormModal de siempre, que le asigna el correlativo. El
// precio se resuelve otra vez contra la sucursal (las líneas van sin precio), como al cobrar
// una mesa: se cobra lo que la caja mostraría hoy.
//
// La ruta pide sales.create: quien cobra necesita poder cobrar. No pide sales.edit (el PATCH de
// la caja) porque aquí no se edita la cuenta, solo se prepara para cobrarla tal cual está.

/**
 * Prepara la cuenta de la cita para cobrarla y la devuelve como la devuelve GET /sales/:id.
 * body: { customer_id, currency_id, exchange_rate } — el cliente de la factura, si la cita no
 * tenía uno registrado, y la moneda y la tasa de la pantalla, como las manda la caja al cobrar.
 */
async function prepararCobro(req, id, body = {}) {
  const updateSale = require("../sales/updateSale");
  const { timeoutMinutes, isExpired } = require("../sales/holdLock");

  const cita = await Appointment.findOne({ where: { id: int(id) } });
  if (!cita) throw fail("Esa cita ya no existe", 404);
  await alcance(req, cita.warehouse_id);
  if (cita.status !== "terminada" || !cita.sale_id) throw fail("Termina la cita para poder cobrarla");

  const venta = await Sale.findOne({ where: { id: cita.sale_id } });
  if (!venta) throw fail("La cuenta de esta cita ya no existe: termínala de nuevo", 409);
  if (!["espera", "borrador"].includes(venta.status)) throw fail("Esta cita ya se cobró", 409);
  if (venta.held_by_employee_id && venta.held_by_employee_id !== req.employee?.id && !isExpired(venta, await timeoutMinutes())) {
    throw fail("Una caja tiene abierta esta cuenta en el POS. Pídele que la pause o cóbrala allí.", 409);
  }

  let customerId = body.customer_id ? int(body.customer_id) : (venta.customer_id || cita.customer_id || null);
  if (customerId && !(await Customer.findOne({ where: { id: customerId }, attributes: ["id"] }))) throw fail("Ese cliente no existe");
  // Quien se registra al cobrar queda también en la cita: la próxima vez ya aparece.
  if (customerId && !cita.customer_id) await cita.update({ customer_id: customerId, updated_at: new Date() });

  // Se factura con la serie de quien cobra en esta sucursal, si tiene una; si no, la que traía.
  // Solo de factura: quien cobra tiene también la de notas de crédito.
  const propias = req.employee?.id ? await UserSerie.findAll({ where: { user_id: req.employee.id }, attributes: ["serie_id"] }) : [];
  const deFactura = { warehouse_id: venta.warehouse_id, active: true, type: "factura" };
  let serie = propias.length
    ? await Serie.findOne({ where: { ...deFactura, id: { [Op.in]: propias.map(s => s.serie_id) } }, order: [["id", "ASC"]] })
    : null;
  // Red por si la cuenta se abrió con una serie que no factura (la de notas de crédito): el
  // correlativo se asigna al cobrar, así que todavía se puede cambiar.
  if (!serie) {
    const actual = await Serie.findOne({ where: { id: venta.serie_id }, attributes: ["id", "type", "active"] });
    if (!actual || actual.type !== "factura" || !actual.active) {
      serie = await Serie.findOne({ where: deFactura, order: [["id", "ASC"]] });
      if (!serie) throw fail("La sucursal no tiene una serie de facturas activa");
    }
  }

  const lineas = await SaleItem.findAll({ where: { sale_id: venta.id }, order: [["id", "ASC"]] });
  if (!lineas.length) throw fail("La cuenta está vacía");

  const lista = await updateSale(venta.id, {
    items: lineas.filter(l => l.product_id).map(l => ({ product_id: l.product_id, qty: parseFloat(l.quantity) })),
    status: "borrador",
    customer_id: customerId,
    ...(body.currency_id !== undefined ? { currency_id: int(body.currency_id) || null } : {}),
    ...(parseFloat(body.exchange_rate) > 0 ? { exchange_rate: parseFloat(body.exchange_rate) } : {}),
    ...(serie ? { serie_id: serie.id } : {}),
  }, req);
  olvidar(`agenda:${cita.warehouse_id}`);
  return lista?.data ?? lista;
}

module.exports = { prepararCobro };
