const { Sale, SaleItem, Product, Payment, KitchenTicket, sequelize, Sequelize } = require("../models");
const { assertWarehouseAccess } = require("../middleware/auth");
const { assertTable } = require("./tables");
const { resumirCuenta } = require("./kitchen");
const { timeoutMinutes, isExpired } = require("./sales/holdLock");
const { calcDescuentoLinea } = require("./sales/lineDiscount");
const { isIntegerUnit } = require("../utils/units");

const { Op } = Sequelize;

// Lo que pasa con las cuentas de las mesas antes de cobrarlas: cambiarlas de mesa, juntarlas,
// dividirlas y marcar que pidieron la cuenta.
//
// Mover platos de una cuenta a otra no toca el inventario: las dos cuentas están en espera y
// lo que se pidió ya salió de la existencia. Por eso aquí se mueven las líneas tal cual
// (precio, descuento, costo, nota) en vez de pasar por createSale/updateSale, que devolverían y
// volverían a descontar todo. Al cobrar, la caja reescribe la cuenta por el camino de siempre.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;

// Una cuenta que se puede tocar desde la mesa: en espera, de una sucursal del empleado y sin una
// caja que la tenga en su carrito. Si una caja la tiene abierta —aunque sea la de quien pide el
// cambio—, al pausarla o cobrarla reescribiría las líneas y desharía lo que se hizo aquí.
async function cuentaEditable(req, saleId, transaction, { minutos }) {
  const sale = await Sale.findOne({ where: { id: int(saleId) }, transaction, lock: true });
  if (!sale) throw fail("La cuenta ya no existe. Recarga la mesa.", 404);
  await assertWarehouseAccess(req, sale.warehouse_id);
  if (sale.status === "borrador") throw fail("La caja está cobrando esta cuenta", 409);
  if (sale.status !== "espera") throw fail("Esa cuenta ya no está abierta. Recarga la mesa.", 409);
  if (sale.held_by_employee_id && !isExpired(sale, minutos)) {
    throw fail("Esta cuenta está abierta en una caja. Pídele que la pause y vuelve a intentarlo.", 409);
  }
  return sale;
}

// Un descuento o recargo de toda la cuenta (o la tasa de divisas) no se sabe repartir entre
// platos: se quita antes y se vuelve a poner al cobrar cada parte.
function sinAjustesGenerales(sale) {
  if (parseFloat(sale.discount_amount) > 0 || parseFloat(sale.service_charge) > 0 || sale.fx_rate) {
    throw fail("Esta cuenta tiene un descuento, recargo o tasa aplicados a toda la cuenta. Quítalos en la caja antes de dividirla o juntarla.");
  }
}

async function sinAbonos(sale, transaction) {
  if (await Payment.count({ where: { sale_id: sale.id }, transaction })) {
    throw fail("Esta cuenta ya tiene abonos registrados: divídela o júntala desde la caja al cobrar.");
  }
}

// El total de una cuenta con sus líneas actuales, con el mismo criterio que updateSale: precio a
// 2 decimales por cantidad, menos el descuento de la línea.
async function recalcularTotal(sale, transaction) {
  const lineas = await SaleItem.findAll({ where: { sale_id: sale.id }, transaction });
  let total = 0;
  for (const l of lineas) {
    const precio = round2(l.price);
    const qty = parseFloat(l.quantity);
    const manual = l.line_discount_mode ? { mode: l.line_discount_mode, value: parseFloat(l.line_discount_value) } : null;
    const desc = manual ? calcDescuentoLinea(manual, precio, qty) : (parseFloat(l.discount) || 0) * qty;
    total += precio * qty - desc;
  }
  total = round2(total - (parseFloat(sale.discount_amount) || 0) + (parseFloat(sale.service_charge) || 0));
  await sale.update({ total: Math.max(0, total) }, { transaction });
}

/**
 * Cambia la cuenta de mesa. Con `join_sale_id`, en vez de quedar como cuenta aparte se junta
 * con esa cuenta (de la mesa destino o de la misma mesa): sus platos y sus comandas pasan a ella
 * y esta desaparece. Una cuenta en espera nunca fue documento, así que se borra (ver cancelSale).
 *
 * body: { table_id?, join_sale_id? }
 */
async function mover(req, saleId, body = {}) {
  const minutos = await timeoutMinutes();
  return sequelize.transaction(async (transaction) => {
    const origen = await cuentaEditable(req, saleId, transaction, { minutos });

    if (body.join_sale_id) {
      const destino = await cuentaEditable(req, body.join_sale_id, transaction, { minutos });
      if (destino.id === origen.id) throw fail("Elige otra cuenta para juntarla");
      if (destino.warehouse_id !== origen.warehouse_id) throw fail("Las cuentas son de sucursales distintas");
      sinAjustesGenerales(origen);
      sinAjustesGenerales(destino);
      await sinAbonos(origen, transaction);

      const mesa = destino.table_id ? await assertTable(destino.table_id, destino.warehouse_id, transaction) : null;
      await SaleItem.update({ sale_id: destino.id }, { where: { sale_id: origen.id }, transaction });
      // Las rondas siguen numeradas detrás de las del destino: la cocina las sigue viendo en orden.
      const previas = await KitchenTicket.count({ where: { sale_id: destino.id }, transaction });
      await KitchenTicket.update(
        {
          sale_id: destino.id,
          round_no: sequelize.literal(`round_no + ${previas}`),
          ...(mesa ? { table_id: mesa.id, label: mesa.name } : {}),
        },
        { where: { sale_id: origen.id }, transaction },
      );

      const pidio = [origen.bill_requested_at, destino.bill_requested_at].filter(Boolean).map(d => new Date(d).getTime());
      await destino.update({
        customer_id: destino.customer_id || origen.customer_id,
        waiter_id: destino.waiter_id || origen.waiter_id,
        bill_requested_at: pidio.length ? new Date(Math.min(...pidio)) : null,
      }, { transaction });
      await origen.destroy({ transaction });
      await recalcularTotal(destino, transaction);
      await resumirCuenta(destino.id, transaction);
      return { data: { sale_id: destino.id, joined: true } };
    }

    if (!body.table_id) throw fail("Elige la mesa");
    const mesa = await assertTable(body.table_id, origen.warehouse_id, transaction);
    if (mesa.id === origen.table_id) throw fail("La cuenta ya está en esa mesa");
    await origen.update({ table_id: mesa.id }, { transaction });
    // La cocina canta la mesa por la comanda: lo que falta por llevar debe ir a la nueva.
    await KitchenTicket.update({ table_id: mesa.id, label: mesa.name }, { where: { sale_id: origen.id }, transaction });
    return { data: { sale_id: origen.id, table_id: mesa.id } };
  });
}

/**
 * Divide la cuenta por platos: lo elegido pasa a una cuenta nueva en la misma mesa, que se cobra
 * y se factura aparte. Cada adicional ("+ Tocineta", el contorno a 0) se va con su plato, en la
 * misma proporción.
 *
 * body: { items: [{ id, qty }] }  — id de la línea (sale_items) y cuánto pasa
 */
async function dividir(req, saleId, body = {}) {
  const minutos = await timeoutMinutes();
  const pedidas = new Map();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const id = int(it.id);
    const qty = round3(it.qty);
    if (!Number.isInteger(id) || !(qty > 0)) continue;
    pedidas.set(id, (pedidas.get(id) || 0) + qty);
  }
  if (!pedidas.size) throw fail("Elige qué platos pasan a la cuenta nueva");

  return sequelize.transaction(async (transaction) => {
    const origen = await cuentaEditable(req, saleId, transaction, { minutos });
    sinAjustesGenerales(origen);
    await sinAbonos(origen, transaction);

    const lineas = await SaleItem.findAll({ where: { sale_id: origen.id }, order: [["id", "ASC"]], transaction });
    const productos = new Map((await Product.findAll({
      where: { id: { [Op.in]: [...new Set(lineas.map(l => l.product_id).filter(Boolean))] } },
      attributes: ["id", "unit", "is_addon"],
      transaction,
    })).map(p => [p.id, p]));

    // Cada adicional cuelga del plato que tiene delante (la venta los guarda detrás de él).
    const mover = new Map();   // id de línea → cantidad que pasa
    let plato = null;
    for (const l of lineas) {
      const p = productos.get(l.product_id);
      const qty = parseFloat(l.quantity);
      if (p?.is_addon && plato) {
        const k = mover.get(plato.id);
        if (k) {
          const parte = isIntegerUnit(p.unit) ? Math.round(qty * k / parseFloat(plato.quantity)) : round3(qty * k / parseFloat(plato.quantity));
          if (parte > 0) mover.set(l.id, Math.min(parte, qty));
        }
        continue;
      }
      plato = l;
      if (!pedidas.has(l.id)) continue;
      const k = pedidas.get(l.id);
      if (k > qty + 0.0005) throw fail(`De "${l.name}" hay ${qty}: no se pueden pasar ${k}`);
      if (isIntegerUnit(p?.unit) && !Number.isInteger(k)) throw fail(`"${l.name}" se divide por unidades enteras`);
      mover.set(l.id, Math.min(k, qty));
    }
    for (const id of pedidas.keys()) {
      if (!lineas.some(l => l.id === id)) throw fail("Uno de los platos ya no está en la cuenta. Recarga la mesa.", 409);
    }
    const quedan = lineas.some(l => !mover.has(l.id) || mover.get(l.id) < parseFloat(l.quantity) - 0.0005);
    if (!quedan) throw fail("Así pasaría la cuenta entera. Para eso usa Mover.");

    const nueva = await Sale.create({
      total: 0,
      paid: 0,
      change: 0,
      customer_id: null,
      employee_id: origen.employee_id,
      currency_id: origen.currency_id,
      exchange_rate: origen.exchange_rate,
      discount_amount: 0,
      service_charge: 0,
      payment_method: origen.payment_method,
      warehouse_id: origen.warehouse_id,
      serie_id: origen.serie_id,
      status: "espera",
      table_id: origen.table_id,
      waiter_id: origen.waiter_id,
      company_id: origen.company_id,
    }, { transaction });

    for (const l of lineas) {
      const k = mover.get(l.id);
      if (!k) continue;
      const qty = parseFloat(l.quantity);
      if (k >= qty - 0.0005) {
        await l.update({ sale_id: nueva.id }, { transaction });
        continue;
      }
      // Parte de la línea: el descuento por unidad viaja igual; uno manual por monto se reparte.
      const porMonto = l.line_discount_mode === "amount";
      const valor = parseFloat(l.line_discount_value) || 0;
      await SaleItem.create({
        sale_id: nueva.id,
        product_id: l.product_id,
        name: l.name,
        price: l.price,
        quantity: k,
        discount: l.discount,
        line_discount_mode: l.line_discount_mode,
        line_discount_value: porMonto ? parseFloat((valor * k / qty).toFixed(5)) : l.line_discount_value,
        discount_by: l.discount_by,
        cost_price: l.cost_price,
        note: l.note,
        company_id: l.company_id,
      }, { transaction });
      await l.update({
        quantity: round3(qty - k),
        ...(porMonto ? { line_discount_value: parseFloat((valor * (qty - k) / qty).toFixed(5)) } : {}),
      }, { transaction });
    }

    await recalcularTotal(origen, transaction);
    await recalcularTotal(nueva, transaction);
    return { data: { sale_id: origen.id, new_sale_id: nueva.id } };
  });
}

/** "Pidió la cuenta": lo marca (o lo quita) quien atiende la mesa. */
async function pedirCuenta(req, saleId, { requested = true } = {}) {
  const sale = await Sale.findOne({ where: { id: int(saleId) } });
  if (!sale) throw fail("La cuenta ya no existe. Recarga la mesa.", 404);
  await assertWarehouseAccess(req, sale.warehouse_id);
  if (!["espera", "borrador"].includes(sale.status)) throw fail("Esa cuenta ya se cobró", 409);
  const valor = requested ? (sale.bill_requested_at || new Date()) : null;
  await sale.update({ bill_requested_at: valor });
  return { data: { sale_id: sale.id, bill_requested_at: valor } };
}

module.exports = { mover, dividir, pedirCuenta };
