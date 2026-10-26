const { Currency, PaymentJournal, SaleItem, Payment, Setting, sequelize, Sequelize } = require("../../models");
const { Op } = Sequelize;
const { hasPermission } = require("../../middleware/auth");
const { netoLineaEnTasa, permisosVigentes } = require("./lineDiscount");

// Cobro a tasa de divisas. Hay comercios que reciben el dólar por encima de la tasa oficial: la
// cuenta da Bs.8000 a 800 y en divisas se cobran $8, porque el dólar se toma a 1000.
//
// Cómo se registra: la diferencia ($2) es un DESCUENTO por pagar en divisas. Suma en
// sales.discount_amount y queda aparte en sales.fx_discount. El total en moneda base es lo que
// entra de verdad a la gaveta, y el arqueo cuadra sin nada especial.
//
// Lo que se cobre en bolívares de esta factura va a la tasa especial (createPayment la impone).
// Con el descuento ya en la base, Bs a 1000 sobre la factura rebajada dan los mismos Bs que a
// precio normal: quien paga todo en bolívares paga lo de siempre, y quien mezcla paga la parte
// en Bs a 1000. Es la regla que pidió el usuario: "si eran 10,50, paga 10$ y 0,50 a 1000 son
// 500 Bs".
//
// Por qué no una tasa distinta en el cobro, sin descuento: ya existió ("tasa de efectivo", ver
// createPayment.js). La deuda en Bs y el abono en base salían de tasas distintas, y quedaban
// facturas saldadas con menos dinero del que decía la pantalla.

const err = (message, status = 400) =>
  Object.assign(new Error(message), { status, isOperational: true });

// El cobro a tasa de divisas es una opción de cada empresa (Configuración → Punto de venta), como
// la revisión del pedido: no todos los comercios reciben el dólar por encima del BCV. Apagada (o
// sin la clave, las empresas de antes), no se puede poner la tasa ni al facturar ni al cobrar.
// Las facturas que ya la tienen se siguen cobrando con ella.
const FX_SETTING_KEY = "pos_fx_cobro";
async function exigirCobroDivisasActivo(companyId, transaction) {
  const row = companyId ? await Setting.findOne({ where: { key: FX_SETTING_KEY, company_id: companyId }, transaction }) : null;
  if (row?.value !== "true") {
    throw err("El cobro a tasa de divisas no está activo en esta empresa (Configuración → Punto de venta)", 403);
  }
}

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// Total en bolívares de la factura a una tasa, con el descuento manual y el recargo: la misma
// cuenta que saleTotalAtRate (frontend) y totalBsAt (createPayment).
function totalEnTasa(lineas, manual, recargo, rate) {
  return round2(
    lineas.reduce((acc, l) => acc + netoLineaEnTasa(l, rate), 0)
    - round2(manual * rate)
    + round2(recargo * rate)
  );
}

// Descuento que deja la factura, cobrada en Bs a la tasa especial `fx`, en el mismo total en
// bolívares que tenía a la tasa del sistema `rate`. Espejo de descuentoDivisas en
// frontend/src/helpers/currency.js: la caja lo calcula y lo manda; aquí sirve de tope.
function descuentoDivisas(lineas, manual, recargo, rate, fx) {
  if (!(fx > 0) || !(rate > 0) || fx <= rate) return 0;
  const bsSistema = totalEnTasa(lineas, manual, recargo, rate);
  const bsLineasFx = lineas.reduce((acc, l) => acc + netoLineaEnTasa(l, fx), 0);
  const d = (bsLineasFx + round2(recargo * fx) - bsSistema) / fx - manual;
  return Math.max(0, parseFloat(d.toFixed(5)));
}

// Lee y valida lo que manda la caja. `lineas` son las de la factura tal como se guardan
// ({ price, discount por unidad, quantity, line_discount_mode/value }); `descuentoTotal` es el
// discount_amount que llegó, que ya incluye el de divisas. Devuelve lo que se guarda en la venta
// y el descuento manual que queda, que es el que pasa por el permiso y el tope de descuentos.
async function leerTasaDivisas(req, body, { lineas, descuentoTotal, recargo, offline = false, transaction }) {
  const sinTasa = { fx: { fx_rate: null, fx_currency_id: null, fx_discount: 0, fx_base_rate: null }, manual: descuentoTotal };
  const tasa = parseFloat(body?.fx_rate);
  const fxDesc = parseFloat(body?.fx_discount);
  if (!(tasa > 0) || !(fxDesc > 0)) return sinTasa;

  const moneda = body.fx_currency_id ? await Currency.findByPk(body.fx_currency_id, { transaction }) : null;
  if (!moneda || moneda.is_base) throw err("Falta la moneda de la tasa de divisas");
  if (fxDesc > descuentoTotal + 0.000005) throw err("El descuento de divisas no cuadra con el de la venta");
  const manual = Math.max(0, parseFloat((descuentoTotal - fxDesc).toFixed(5)));

  // Sin conexión no se controla, igual que los descuentos: la venta ya ocurrió en el mostrador
  // y se registra tal como se cobró.
  if (!offline) await exigirCobroDivisasActivo(req?.company_id ?? req?.employee?.company_id, transaction);
  if (!offline && !req?.is_superuser) {
    const perms = await permisosVigentes(req, transaction);
    if (!perms?.all && !hasPermission(perms, "sales.fx")) {
      throw err("Tu usuario no tiene permiso para cobrar a tasa de divisas", 403);
    }
  }
  if (!offline) {
    const sistema = parseFloat(moneda.exchange_rate) || 0;
    if (!(tasa > sistema)) {
      throw err(`La tasa de divisas tiene que ser mayor que la del sistema (${sistema.toFixed(2)})`);
    }
    // Tope: lo que sale de la tasa tecleada, con la del sistema de la base. La caja pudo
    // calcular con una tasa recién cambiada, así que se deja un 2 % de holgura: el control de
    // quién usa la tasa es el permiso, esto solo impide mandar un descuento inventado.
    const tope = descuentoDivisas(lineas, manual, recargo, sistema, tasa);
    const neto = totalEnTasa(lineas, manual, recargo, tasa) / tasa;
    if (fxDesc > tope + 0.01 + neto * 0.02) {
      throw err("El descuento de divisas no corresponde a la tasa indicada");
    }
  }

  // La tasa del sistema con que la caja calculó la rebaja (a ella se imprime el ticket en Bs). Se
  // acepta la que manda si está cerca de la de la base —la caja pudo tener la del día anterior
  // unos minutos—; si no, o si no la manda, la de la base.
  const sistemaHoy = parseFloat(moneda.exchange_rate) || 0;
  const baseCaja = parseFloat(body.fx_base_rate);
  const fxBase = baseCaja > 0 && (offline || !(sistemaHoy > 0) || Math.abs(baseCaja - sistemaHoy) <= sistemaHoy * 0.02)
    ? baseCaja : sistemaHoy;

  return {
    fx: {
      fx_rate: parseFloat(tasa.toFixed(6)), fx_currency_id: moneda.id, fx_discount: parseFloat(fxDesc.toFixed(5)),
      fx_base_rate: fxBase > 0 ? parseFloat(fxBase.toFixed(6)) : null,
    },
    manual,
  };
}

// Tasa a la que entra un cobro de esta factura por la caja `journalId`: la especial si la caja
// es de la moneda de la tasa, y si no, ninguna (manda la que traiga el cobro).
async function tasaDivisasDeCaja(sale, journalId, transaction) {
  const fx = parseFloat(sale?.fx_rate);
  if (!(fx > 0) || !sale.fx_currency_id || !journalId) return null;
  const caja = await PaymentJournal.findByPk(journalId, { attributes: ["id", "currency_id"], transaction });
  return caja && parseInt(caja.currency_id) === parseInt(sale.fx_currency_id) ? fx : null;
}

// Lo mismo que tienePagoEnDivisas, como columna de un listado de ventas ("Sale" es el alias).
const FX_PAGO_DIVISAS_SQL = `(CASE WHEN "Sale"."fx_rate" IS NULL THEN false ELSE EXISTS (
  SELECT 1 FROM payments p JOIN payment_journals pj ON pj.id = p.payment_journal_id
   WHERE p.sale_id = "Sale"."id" AND p.amount > 0
     AND pj.currency_id IS DISTINCT FROM "Sale"."fx_currency_id") END)`;

// ¿La factura ya recibió algún cobro en divisas (una caja que no es de la moneda de la tasa)?
async function tienePagoEnDivisas(sale, transaction) {
  const [filas] = await sequelize.query(`
    SELECT 1 FROM payments p
      JOIN payment_journals pj ON pj.id = p.payment_journal_id
     WHERE p.sale_id = :id AND p.amount > 0
       AND pj.currency_id IS DISTINCT FROM :moneda
     LIMIT 1`, { replacements: { id: sale.id, moneda: sale.fx_currency_id ?? null }, transaction });
  return filas.length > 0;
}

// La tasa especial es para quien paga en divisas: al menos un cobro de la factura tiene que
// entrar en divisas (decisión del usuario, 26-10-2026). Un cobro en bolívares se admite si la
// factura ya tiene uno en divisas —abonó los $10 ayer y hoy paga el resto en Bs— o si el mismo
// cobro trae una parte en divisas (pago combinado). `cajas` son las del cobro que llega.
//
// `fxEnEsteCobro`: la tasa se le aplicó en este mismo cobro (fx_cobro). Si no, una factura ya
// emitida a crédito ('pendiente', o 'parcial' tras abonar) no lo exige: una con tasa sin ningún
// cobro en divisas solo puede ser una que se fió antes de que existiera la regla de contado
// (quitarTasaDivisas, 26-10-2026), y en Bs a su tasa paga lo mismo que a precio normal.
// Exigírselo la dejaba sin forma de cobrarse en Bs. Las demás ya tuvieron su cobro en divisas
// —la regla se lo pidió al primero—, así que la exención no les cambia nada.
function exentaDeDivisas(sale, fxEnEsteCobro) {
  return !fxEnEsteCobro && ["pendiente", "parcial"].includes(sale?.status);
}

async function exigirPagoEnDivisas(sale, cajas, transaction, { fxEnEsteCobro = false } = {}) {
  if (!(parseFloat(sale?.fx_rate) > 0) || !sale.fx_currency_id) return;
  if (exentaDeDivisas(sale, fxEnEsteCobro)) return;
  const ids = [...new Set((cajas || []).filter(Boolean).map(Number))];
  if (!ids.length) return;
  const filas = await PaymentJournal.findAll({ where: { id: ids }, attributes: ["id", "currency_id"], transaction });
  const esDeLaTasa = (c) => parseInt(c.currency_id) === parseInt(sale.fx_currency_id);
  if (!filas.some(esDeLaTasa)) return;           // no entra nada en bolívares
  if (filas.some(c => !esDeLaTasa(c))) return;   // el mismo cobro trae divisas
  if (await tienePagoEnDivisas(sale, transaction)) return;
  throw err(
    `La factura ${sale.invoice_number || `#${sale.id}`} lleva tasa de divisas: al menos una parte del pago tiene que ser en divisas. Usa un pago combinado.`
  );
}

// La tasa especial es de contado (decisión del usuario, 26-10-2026): una factura con tasa que se
// entrega a crédito sin haber recibido nada la pierde y vuelve a precio normal. Se hace antes de
// numerarla —sigue en borrador—, así que no se altera ningún documento emitido. Si mañana paga
// en divisas, la tasa se le aplica en el cobro (createPayment, `fx_cobro`).
//
// El total en base se rearma como createSale: precio redondeado por línea menos su descuento en
// esa pista. La línea guarda el descuento por unidad sobre el precio completo; para promociones y
// porcentajes es proporcional al precio, y un monto manual vale lo mismo en las dos pistas.
async function quitarTasaDivisas(sale, transaction) {
  if (!(parseFloat(sale?.fx_rate) > 0)) return false;
  const fx = parseFloat(sale.fx_discount) || 0;
  const descuento = Math.max(0, parseFloat(((parseFloat(sale.discount_amount) || 0) - fx).toFixed(5)));
  const lineas = await SaleItem.findAll({ where: { sale_id: sale.id }, transaction, raw: true });
  const neto = lineas.reduce((acc, l) => {
    const p = parseFloat(l.price) || 0, q = parseFloat(l.quantity) || 0, rp = round2(p);
    const d = l.line_discount_mode === "amount"
      ? Math.min(parseFloat(l.line_discount_value) || 0, rp * q)
      : (p > 0 ? (parseFloat(l.discount) || 0) * q * (rp / p) : 0);
    return acc + rp * q - d;
  }, 0);
  let total = Math.max(0, parseFloat((neto - descuento + (parseFloat(sale.service_charge) || 0)).toFixed(2)));
  // Red de seguridad: nunca más de un céntimo lejos de devolverle el descuento al total.
  const aprox = round2(parseFloat(sale.total) + fx);
  if (Math.abs(total - aprox) > 0.011) total = aprox;
  await sale.update({ total, discount_amount: descuento, fx_rate: null, fx_currency_id: null, fx_discount: 0, fx_base_rate: null }, { transaction });
  return true;
}

// La rebaja por pagar en divisas aplicada al cobrar (fx_forgiven) se pactó con ese cobro. Si se
// borra y la factura se queda sin ningún cobro, la rebaja pierde su razón: se deshace junto con
// la tasa, y la factura vuelve a deber su precio normal. Si quedan cobros, se respeta: alguno
// de ellos ya entró a esa tasa. Va antes de recalcular el estado (removePayment y lote).
async function deshacerTasaDeCobro(sale, transaction) {
  const rebaja = parseFloat(sale?.fx_forgiven) || 0;
  if (!(rebaja > 0)) return false;
  const quedan = await Payment.count({ where: { sale_id: sale.id, amount: { [Op.gt]: 0 } }, transaction });
  if (quedan > 0) return false;
  const resto = Math.max(0, parseFloat(((parseFloat(sale.forgiven_amount) || 0) - rebaja).toFixed(6)));
  await sale.update({
    forgiven_amount: resto,
    fx_forgiven: 0,
    fx_rate: null, fx_currency_id: null, fx_base_rate: null,
    ...(resto > 0 ? {} : { forgiven_reason: null, forgiven_by: null, forgiven_at: null }),
  }, { transaction });
  return true;
}

module.exports = { FX_SETTING_KEY, exigirCobroDivisasActivo, deshacerTasaDeCobro, exentaDeDivisas, quitarTasaDivisas, leerTasaDivisas, tasaDivisasDeCaja, descuentoDivisas, tienePagoEnDivisas, exigirPagoEnDivisas, FX_PAGO_DIVISAS_SQL };
