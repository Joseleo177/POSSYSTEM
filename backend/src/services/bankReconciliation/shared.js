'use strict';

const models = require("../../models");
const { localDate, TZ } = require("../reports/shared");

const { sequelize, Sequelize } = models;
const QT = Sequelize.QueryTypes;

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Céntimo de holgura. El extracto trae dos decimales; el sistema guarda el monto en base con
// seis y lo multiplica por la tasa, así que un cobro de Bs 1000 puede salir 999.999998.
const TOL = 0.01;

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100 + Number.EPSILON * 100) / 100;
const cents = (n) => Math.round((parseFloat(n) || 0) * 100);

const companyOf = (req) => {
  const c = req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa para conciliar sus bancos");
  return parseInt(c, 10);
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Días entre dos fechas 'YYYY-MM-DD' (b − a), sin pasar por la zona horaria del proceso.
const dayNum = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const dayDiff = (a, b) => dayNum(b) - dayNum(a);
const shiftDay = (iso, days) => new Date((dayNum(iso) + days) * 86400000).toISOString().slice(0, 10);

// Referencia reducida a sus dígitos significativos. El banco escribe "000123456789" donde el
// cajero tecleó "6789" (los últimos dígitos del pago móvil), así que se comparan por el final.
const refDigits = (s) => String(s || "").replace(/\D/g, "").replace(/^0+/, "");

// ¿Las referencias del banco y del documento hablan del mismo pago? Se exige un mínimo de
// cuatro dígitos: con menos, cualquier par de números coincide por casualidad.
function refMatches(lineRefs, docRef) {
  const d = refDigits(docRef);
  if (d.length < 4) return false;
  return lineRefs.some(r => r.length >= 4 && (r.endsWith(d) || d.endsWith(r)));
}

// Referencias candidatas de una línea: la columna de referencia y los números largos que
// algunos bancos meten dentro de la descripción ("PAGO MOVIL 04141234567 REF 123456").
function lineRefs(line) {
  const out = [];
  const main = refDigits(line.reference);
  if (main) out.push(main);
  for (const tok of String(line.description || "").match(/\d{4,}/g) || []) {
    const t = tok.replace(/^0+/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

const lineAmount = (l) => r2(parseFloat(l.credit) > 0 ? l.credit : l.debit);
const lineDir = (l) => (parseFloat(l.credit) > 0 ? "in" : "out");

module.exports = {
  ...models, sequelize, Sequelize, QT, localDate, TZ,
  fail, TOL, r2, cents, companyOf, ISO_DAY, dayDiff, shiftDay,
  refDigits, refMatches, lineRefs, lineAmount, lineDir,
};
