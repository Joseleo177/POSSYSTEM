const { desglose, ivaActivo, redondeoFiscal: R } = require("./iva");

// Datos fiscales de un gasto con factura (luz, alquiler, internet): entra al Libro de compras.
//
// El gasto se carga por lo que se pagó, IVA incluido, así que el IVA sale hacia atrás del total del
// papel con la misma regla que la imprenta (ver iva.desglose). Si el papel dice otro IVA por un
// céntimo de redondeo, se acepta el del papel: es lo que el proveedor declaró.

const fail = (message) => Object.assign(new Error(message), { status: 400, isOperational: true });
const texto = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const ALICUOTAS_VALIDAS = [0, 8, 16, 31];

/**
 * Valida y arma las columnas fiscales de un gasto. `body` trae lo del formulario; `gasto` el monto
 * en base, la tasa y la empresa. Sin `fiscal`, devuelve todo en blanco (un gasto sin factura).
 */
async function datosFiscalesGasto(body, { amount, rate, company_id, fecha }, transaction) {
  const fiscal = body.fiscal === true || body.fiscal === "true";
  const vacio = {
    fiscal: false, supplier_rif: null, supplier_name: null, invoice_number: null, control_number: null,
    invoice_date: null, iva_rate: null, iva_amount: 0, invoice_total: null,
  };
  if (!fiscal) return vacio;
  if (!(await ivaActivo(company_id, transaction))) throw fail("La factura con IVA no está activa en esta empresa");

  const numero = texto(body.invoice_number, 40);
  const control = texto(body.control_number, 40);
  const rif = texto(body.supplier_rif, 20);
  const nombre = texto(body.supplier_name, 200);
  // Sin fecha de factura, la del gasto (llega como texto del formulario o como Date de la base).
  const delGasto = fecha instanceof Date
    ? fecha.toLocaleDateString("en-CA", { timeZone: process.env.TZ || "America/Caracas" })
    : String(fecha || "").slice(0, 10);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(body.invoice_date || "")) ? body.invoice_date
    : (/^\d{4}-\d{2}-\d{2}$/.test(delGasto) ? delGasto : null);
  if (!rif) throw fail("Falta el RIF del proveedor de la factura");
  if (!nombre) throw fail("Falta el nombre o razón social del proveedor");
  if (!numero) throw fail("Escribe el número de la factura");
  if (!control) throw fail("Escribe el número de control de la factura");
  if (!dia) throw fail("Indica la fecha de la factura");

  const tasa = ALICUOTAS_VALIDAS.includes(parseFloat(body.iva_rate)) ? parseFloat(body.iva_rate) : 16;
  // Total del papel: el que se tecleó o, si no vino, el monto pasado a la moneda del gasto.
  const total = parseFloat(body.invoice_total) > 0
    ? R(body.invoice_total)
    : R((parseFloat(amount) || 0) * (parseFloat(rate) || 1));
  if (!(total > 0)) throw fail("El monto de la factura tiene que ser mayor que cero");

  const calculado = tasa > 0 ? desglose([{ monto: total, tasa }], total).iva : 0;
  let iva = calculado;
  if (body.iva_amount !== undefined && body.iva_amount !== null && body.iva_amount !== "") {
    const papel = R(body.iva_amount);
    // El del papel manda si es redondeo; un IVA muy distinto es otra alícuota mal elegida.
    if (Math.abs(papel - calculado) > 0.05 + 1e-9) {
      throw fail(`El IVA de la factura (${papel.toFixed(2)}) no corresponde al ${tasa} % de ${total.toFixed(2)}: debería ser ${calculado.toFixed(2)}`);
    }
    iva = tasa > 0 ? papel : 0;
  }

  return {
    fiscal: true, supplier_rif: rif, supplier_name: nombre, invoice_number: numero, control_number: control,
    invoice_date: dia, iva_rate: tasa, iva_amount: iva, invoice_total: total,
  };
}

module.exports = { datosFiscalesGasto };
