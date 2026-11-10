const { IvaDeclaration, Sequelize } = require("../../models");
const { Op } = Sequelize;
const libroVentasReport = require("../reports/libroVentasReport");
const libroComprasReport = require("../reports/libroComprasReport");
const { ivaActivo } = require("./iva");

// Declaración de IVA del período (forma 30 del SENIAT, "resumen del artículo 72"). Mismo cálculo que
// gme_contabilidad_ve en Odoo 19 (declaracion_iva.py):
//  - débitos (ventas) y créditos (compras) salen de los libros del período, con sus mismos totales;
//  - los créditos se deducen en la proporción de las ventas gravadas sobre el total de ventas
//    (prorrata); el resto no es deducible. Se puede corregir a mano (prorrata acumulada del año);
//  - se suma el excedente de créditos de la declaración anterior; si los créditos superan a los
//    débitos, la diferencia es el excedente para la siguiente;
//  - las retenciones de IVA de los clientes se descuentan de la cuota; lo que no alcanzó pasa también;
//  - anticipo de ISLR: un % de las ventas del período (contribuyentes especiales).
// Una declaración se calcula en borrador; al declararla queda fija, y si los libros cambiaron desde que
// se calculó pide volver a calcular (lo declarado tiene que cuadrar con los libros impresos).
//
// Todavía no asienta nada: los asientos contables (débito/crédito fiscal contra IVA por pagar) llegan
// con la etapa contable.

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Casilla de la declaración ← columna del resumen del libro.
const DEL_LIBRO_DE_VENTAS = {
  ventas_exentas: (r) => r.exento,
  ventas_base_general: (r) => r.gravado[16]?.base, debito_general: (r) => r.gravado[16]?.iva,
  ventas_base_adicional: (r) => r.gravado[31]?.base, debito_adicional: (r) => r.gravado[31]?.iva,
  ventas_base_reducida: (r) => r.gravado[8]?.base, debito_reducida: (r) => r.gravado[8]?.iva,
  retenciones_periodo: (r) => r.retenido,
};
const DEL_LIBRO_DE_COMPRAS = {
  compras_exentas: (r) => r.exento,
  compras_base_general: (r) => r.gravado[16]?.base, credito_general: (r) => r.gravado[16]?.iva,
  compras_base_adicional: (r) => r.gravado[31]?.base, credito_adicional: (r) => r.gravado[31]?.iva,
  compras_base_reducida: (r) => r.gravado[8]?.base, credito_reducida: (r) => r.gravado[8]?.iva,
};
const MONTOS = [...Object.keys(DEL_LIBRO_DE_VENTAS), ...Object.keys(DEL_LIBRO_DE_COMPRAS),
  "creditos_prorrata", "excedente_anterior", "retenciones_anteriores", "anticipo_porcentaje"];

const QUINCENAS = { mes: "Mes", 1: "1ra quincena", 2: "2da quincena" };

// Fechas del período: AAAAMM y mes o quincena.
function fechasDe(periodo, quincena) {
  const m = String(periodo || "").match(/^(\d{4})(\d{2})$/);
  if (!m || !QUINCENAS[quincena]) return null;
  const anio = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  const ultimo = new Date(anio, mes, 0).getDate();
  const [d1, d2] = quincena === "1" ? [1, 15] : quincena === "2" ? [16, ultimo] : [1, ultimo];
  const f = (d) => `${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`;
  return { desde: f(d1), hasta: f(d2) };
}

function prorrataDe(d) {
  const creditos = r2(d.credito_general + d.credito_adicional + d.credito_reducida);
  const ventas = d.ventas_exentas + d.ventas_base_general + d.ventas_base_adicional + d.ventas_base_reducida;
  const exentas = Math.max(d.ventas_exentas, 0);
  return ventas > 0 ? r2(creditos * (1 - exentas / ventas)) : creditos;
}

// La declaración con sus totales, como la lee la pantalla.
function presentar(row) {
  const d = row.toJSON ? row.toJSON() : { ...row };
  for (const k of MONTOS) d[k] = parseFloat(d[k]) || 0;
  const t = {};
  t.total_ventas = r2(d.ventas_exentas + d.ventas_base_general + d.ventas_base_adicional + d.ventas_base_reducida);
  t.total_debitos = r2(d.debito_general + d.debito_adicional + d.debito_reducida);
  t.total_compras = r2(d.compras_exentas + d.compras_base_general + d.compras_base_adicional + d.compras_base_reducida);
  t.total_creditos = r2(d.credito_general + d.credito_adicional + d.credito_reducida);
  t.creditos_no_deducibles = r2(t.total_creditos - d.creditos_prorrata);
  t.total_creditos_deducibles = r2(d.creditos_prorrata + d.excedente_anterior);
  t.cuota = r2(Math.max(t.total_debitos - t.total_creditos_deducibles, 0));
  t.excedente_siguiente = r2(Math.max(t.total_creditos_deducibles - t.total_debitos, 0));
  t.total_retenciones = r2(d.retenciones_anteriores + d.retenciones_periodo);
  t.retenciones_descontadas = r2(Math.min(t.total_retenciones, t.cuota));
  t.retenciones_saldo = r2(t.total_retenciones - t.retenciones_descontadas);
  t.total_pagar = r2(t.cuota - t.retenciones_descontadas);
  t.anticipo_islr = r2(Math.max(t.total_ventas, 0) * d.anticipo_porcentaje / 100);
  const parte = d.quincena === "mes" ? "" : ` · ${QUINCENAS[d.quincena]}`;
  return { ...d, ...t, nombre: `IVA ${d.periodo.slice(4)}/${d.periodo.slice(0, 4)}${parte}` };
}

const empresaDe = (req) => {
  const cid = req.employee?.company_id;
  if (!cid) throw fail("Elige una empresa para ver sus declaraciones");
  return cid;
};

// Totales de los dos libros del período, de toda la empresa (la declaración es por RIF, no por sucursal).
async function libros(company_id, desde, hasta) {
  const args = { date_from: desde, date_to: hasta, company_id, allowedWarehouses: null };
  const [ventas, compras] = await Promise.all([libroVentasReport(args), libroComprasReport(args)]);
  const vals = {};
  for (const [campo, col] of Object.entries(DEL_LIBRO_DE_VENTAS)) vals[campo] = r2(col(ventas.resumen));
  for (const [campo, col] of Object.entries(DEL_LIBRO_DE_COMPRAS)) vals[campo] = r2(col(compras.resumen));
  return {
    vals,
    documentos_ventas: ventas.resumen.facturas + ventas.resumen.notas,
    documentos_compras: compras.resumen.facturas,
    sin_iva_ventas: ventas.resumen.sin_iva || 0,
  };
}

// La última declaración ya presentada antes de este período: de ella vienen el excedente y las
// retenciones por descontar.
async function anteriorDe(d) {
  return IvaDeclaration.findOne({
    where: { company_id: d.company_id, state: { [Op.ne]: "borrador" }, fecha_hasta: { [Op.lt]: d.fecha_desde }, id: { [Op.ne]: d.id } },
    order: [["fecha_hasta", "DESC"], ["id", "DESC"]],
  });
}

async function cargar(id, req) {
  const d = await IvaDeclaration.findOne({ where: { id, company_id: empresaDe(req) } });
  if (!d) throw fail("Declaración no encontrada", 404);
  return d;
}

async function listar(req) {
  const rows = await IvaDeclaration.findAll({ where: { company_id: empresaDe(req) }, order: [["fecha_desde", "DESC"], ["id", "DESC"]] });
  return rows.map(presentar);
}

async function calcular(id, req) {
  const d = await cargar(id, req);
  if (d.state !== "borrador") throw fail("Solo se calcula una declaración en borrador");
  const l = await libros(d.company_id, d.fecha_desde, d.fecha_hasta);
  const anterior = await anteriorDe(d);
  const prev = anterior ? presentar(anterior) : null;
  const vals = {
    ...l.vals,
    documentos_ventas: l.documentos_ventas,
    documentos_compras: l.documentos_compras,
    sin_iva_ventas: l.sin_iva_ventas,
    excedente_anterior: prev ? prev.excedente_siguiente : 0,
    retenciones_anteriores: prev ? prev.retenciones_saldo : 0,
    calculated_at: new Date(),
  };
  // La prorrata vuelve a su cálculo salvo que se haya corregido a mano.
  if (!d.prorrata_manual) vals.creditos_prorrata = prorrataDe({ ...presentar(d), ...vals });
  await d.update(vals);
  return presentar(d);
}

async function crear({ periodo, quincena = "mes" }, req) {
  const company_id = empresaDe(req);
  if (!(await ivaActivo(company_id))) throw fail("La factura con IVA no está activa en esta empresa");
  const q = String(quincena);
  const f = fechasDe(periodo, q);
  if (!f) throw fail("Período inválido: elige el mes (y la quincena si declaras por quincena)");
  // Un mes no se declara entero y por quincenas a la vez: los períodos no pueden pisarse.
  const choca = await IvaDeclaration.findOne({
    where: { company_id, fecha_desde: { [Op.lte]: f.hasta }, fecha_hasta: { [Op.gte]: f.desde } },
  });
  if (choca) throw fail(`Ese período ya está en la declaración ${presentar(choca).nombre}`);
  const d = await IvaDeclaration.create({ company_id, periodo, quincena: q, fecha_desde: f.desde, fecha_hasta: f.hasta });
  return calcular(d.id, req);
}

// Correcciones a mano en borrador: prorrata, excedente y retenciones arrastradas, % de anticipo. La
// planilla del SENIAT se anota en cualquier estado.
async function editar(id, body, req) {
  const d = await cargar(id, req);
  const vals = {};
  if (body.planilla !== undefined) vals.planilla = String(body.planilla || "").trim().slice(0, 40) || null;
  const enBorrador = ["creditos_prorrata", "prorrata_manual", "excedente_anterior", "retenciones_anteriores", "anticipo_porcentaje"]
    .some(k => body[k] !== undefined);
  if (enBorrador && d.state !== "borrador") throw fail("La declaración ya está presentada: vuélvela a borrador para corregirla");
  const num = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) throw fail("Los montos de la declaración no pueden ser negativos");
    return r2(n);
  };
  if (body.excedente_anterior !== undefined) vals.excedente_anterior = num(body.excedente_anterior);
  if (body.retenciones_anteriores !== undefined) vals.retenciones_anteriores = num(body.retenciones_anteriores);
  if (body.anticipo_porcentaje !== undefined) {
    const p = num(body.anticipo_porcentaje);
    if (p > 100) throw fail("El anticipo de ISLR es un porcentaje de 0 a 100");
    vals.anticipo_porcentaje = p;
  }
  if (body.creditos_prorrata !== undefined) {
    const p = num(body.creditos_prorrata);
    const creditos = r2(parseFloat(d.credito_general) + parseFloat(d.credito_adicional) + parseFloat(d.credito_reducida));
    if (p > creditos + 0.005) throw fail("Los créditos deducibles no pueden superar los créditos fiscales del período");
    vals.creditos_prorrata = p;
    vals.prorrata_manual = true;
  }
  if (body.prorrata_manual === false) {
    vals.prorrata_manual = false;
    vals.creditos_prorrata = prorrataDe({ ...presentar(d), ...vals });
  }
  await d.update(vals);
  return presentar(d);
}

async function declarar(id, req) {
  const d = await cargar(id, req);
  if (d.state !== "borrador") throw fail("La declaración ya está presentada");
  // Lo que se declara tiene que ser lo que dicen los libros hoy.
  const l = await libros(d.company_id, d.fecha_desde, d.fecha_hasta);
  const cambio = Object.entries(l.vals).some(([k, v]) => Math.abs(r2(d[k]) - v) > 0.005);
  if (cambio) throw fail("Los libros del período cambiaron desde que se calculó (hay documentos nuevos o modificados): calcula otra vez antes de declarar");
  // El excedente de esta sale de la anterior: no se presenta una sobre otra que sigue en borrador. (El
  // excedente arrastrado sí se puede corregir a mano: el que venía de antes de usar el sistema.)
  const borradorAntes = await IvaDeclaration.findOne({
    where: { company_id: d.company_id, state: "borrador", fecha_hasta: { [Op.lt]: d.fecha_desde } },
  });
  if (borradorAntes) throw fail(`Declara primero ${presentar(borradorAntes).nombre}: de ella sale el excedente de esta`);
  await d.update({ state: "declarada", declared_at: new Date(), declared_by: req.employee?.id ?? null });
  return presentar(d);
}

async function volverBorrador(id, req) {
  const d = await cargar(id, req);
  if (d.state === "pagada") throw fail("La declaración ya está pagada: deshaz primero el pago");
  if (d.state === "borrador") return presentar(d);
  // La siguiente tomó de esta su excedente: no puede quedar presentada sobre una base que cambia.
  const posterior = await IvaDeclaration.findOne({
    where: { company_id: d.company_id, state: { [Op.ne]: "borrador" }, fecha_desde: { [Op.gt]: d.fecha_hasta } },
    order: [["fecha_desde", "ASC"]],
  });
  if (posterior) throw fail(`Primero vuelve a borrador ${presentar(posterior).nombre}, que toma el excedente de esta`);
  await d.update({ state: "borrador", declared_at: null, declared_by: null });
  return presentar(d);
}

async function marcarPago(id, { fecha_pago, referencia_pago, deshacer }, req) {
  const d = await cargar(id, req);
  if (deshacer) {
    if (d.state !== "pagada") throw fail("La declaración no está pagada");
    await d.update({ state: "declarada", fecha_pago: null, referencia_pago: null });
    return presentar(d);
  }
  if (d.state !== "declarada") throw fail("Solo se paga una declaración ya presentada");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha_pago || ""))) throw fail("Indica la fecha del pago");
  await d.update({ state: "pagada", fecha_pago, referencia_pago: String(referencia_pago || "").trim().slice(0, 80) || null });
  return presentar(d);
}

async function eliminar(id, req) {
  const d = await cargar(id, req);
  if (d.state !== "borrador") throw fail("Solo se elimina una declaración en borrador");
  await d.destroy();
  return { ok: true };
}

module.exports = { listar, crear, calcular, editar, declarar, volverBorrador, marcarPago, eliminar, presentar, fechasDe, prorrataDe };
