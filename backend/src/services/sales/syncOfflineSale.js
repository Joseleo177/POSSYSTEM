const { Sale, Employee } = require("../../models");
const createSale = require("./createSale");
const createPayment = require("../payments/createPayment");

// Recibe una venta que una caja hizo sin internet (se cayó la conexión o se fue la luz) y que
// ahora envía desde su cola. La mercancía ya salió y el dinero ya entró: aquí solo se registra.
//
// Son dos pasos, cada uno idempotente con su propia clave, así que la caja puede reintentar
// el envío completo cuantas veces haga falta sin duplicar nada:
//   1. La venta, con el precio y la promoción con que se cobró y descontando existencias
//      aunque queden en negativo (ver `offline` en createSale.js).
//   2. Los cobros, fechados a su hora real. Es el que le asigna el correlativo de la
//      serie: la factura nace al llegar, en orden con las demás.
//
// No van en una sola transacción a propósito. Si el cobro se rechaza —una caja desactivada
// mientras tanto, por ejemplo— la venta igual queda registrada como borrador, con su salida
// de inventario, y aparece en Facturas Pendientes para cobrarla a mano. Perderla entera sería
// peor: la mercancía ya no está.
//
// Cuerpo:
//   idempotency_key  la de la venta, generada por la caja al cobrar
//   sold_at          hora real de la venta (ISO)
//   offline_ref      número del ticket provisional que se entregó ("P-3F2A-0007")
//   employee_id      el cajero que vendió, que puede no ser quien envía (otro turno, otro login)
//   ...venta         lo mismo que POST /sales, con price y promo en cada línea
//   payments         lista de cobros, cada uno como POST /payments sin sale_id ni
//                    idempotency_key, con paid_at opcional (hora real de ese cobro)
module.exports = async function syncOfflineSale(body, req) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

  const key = String(body.idempotency_key || "").trim();
  if (!key || key.length > 50) throw fail("La venta sin conexión no trae una clave válida");

  const soldAt = new Date(body.sold_at);
  if (Number.isNaN(soldAt.getTime())) throw fail("La venta sin conexión no trae su hora");
  // Unos minutos de margen por el reloj del equipo; una venta del futuro no tiene sentido y
  // descuadraría el arqueo de un turno que todavía no existe.
  if (soldAt.getTime() > Date.now() + 10 * 60 * 1000) {
    throw fail("La hora de la venta es posterior a la actual: revisa el reloj del equipo");
  }

  // El cobro y el arqueo son del cajero que vendió. Solo se acepta uno de esta empresa (el
  // filtro por empresa de los modelos lo garantiza) y, si no llega, quien envía.
  let employeeId = req.employee?.id || null;
  if (body.employee_id && parseInt(body.employee_id) !== employeeId) {
    const vendedor = await Employee.findByPk(body.employee_id, { attributes: ["id"] });
    if (!vendedor) throw fail("El cajero de la venta no existe en esta empresa");
    employeeId = vendedor.id;
  }

  const offlineRef = String(body.offline_ref || "").trim().slice(0, 40) || null;

  const sale = await createSale(
    { ...body, idempotency_key: key, employee_id: employeeId, paid: 0, hold: false },
    req,
    { offline: { sold_at: soldAt, ref: offlineRef } },
  );

  // Los cobros, en el orden en que se hicieron: sin conexión también se puede abonar en dos
  // pasos (parte en divisas, luego el resto). Cada uno lleva su clave fija según su posición,
  // así que un reenvío reconoce los que ya entraron. Si uno se rechaza, los siguientes no se
  // intentan: abonarían sobre un saldo que ya no es el que vio la caja.
  const cobrosCuerpo = Array.isArray(body.payments) ? body.payments : (body.payment ? [body.payment] : []);
  const pagos = [];
  let creditApplied = 0;
  let changeGiven = 0;
  let cobroError = null;
  for (let i = 0; i < cobrosCuerpo.length; i++) {
    const p = cobrosCuerpo[i];
    try {
      const r = await createPayment(
        {
          ...p,
          sale_id: sale.id,
          employee_id: employeeId,
          idempotency_key: `${key}-pago-${i}`,
        },
        req,
        // Cada cobro con su propia hora, si la trae; si no, la de la venta.
        { createdAt: p.paid_at && !Number.isNaN(new Date(p.paid_at).getTime()) ? new Date(p.paid_at) : soldAt },
      );
      pagos.push(...(r.payments || []));
      creditApplied += parseFloat(r.credit_applied || 0);
      changeGiven += parseFloat(r.change_given || 0);
    } catch (err) {
      // Ya cobrada por otra vía (alguien la saldó a mano desde Pendientes): no es un error.
      const actual = await Sale.findByPk(sale.id, { attributes: ["status"] });
      if (!["pagado", "exonerado"].includes(actual?.status)) cobroError = err.message;
      break;
    }
  }

  const final = await Sale.findByPk(sale.id, { attributes: ["status", "invoice_number"] });
  return {
    sale: { ...sale, status: final?.status ?? sale.status, invoice_number: final?.invoice_number ?? null },
    payments: pagos,
    credit_applied: creditApplied,
    change_given: changeGiven,
    stock_negativo: sale.stock_negativo || [],
    // La venta entró pero el cobro no: queda en Facturas Pendientes. La caja lo muestra en
    // su bandeja con este motivo, sin reintentarlo en bucle.
    cobro_error: cobroError,
  };
};
