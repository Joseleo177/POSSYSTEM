const { Setting, Employee, Role } = require("../../models");
const { hasPermission } = require("../../middleware/auth");

// Descuento manual por línea y el control de quién puede dar descuentos. Lo comparten
// createSale (factura, cuenta en espera y venta sin conexión) y updateSale (cobro de una cuenta
// en espera), igual que promoDiscounts.js: si cada uno lo calculara a su manera, la caja
// mostraría un total y la factura saldría con otro.
//
// Un descuento manual REEMPLAZA a la promoción de esa línea, no se suma. Dos rebajas sobre el
// mismo producto dan precios que nadie en la caja sabe explicar.

const MAX_SETTING_KEY = "discount_max_pct";

const err = (message, status = 400) =>
  Object.assign(new Error(message), { status, isOperational: true });

// Lo que manda la caja en `item.line_discount`, validado. null = la línea no lleva descuento
// manual. El monto es el de la LÍNEA entera en moneda base, con 5 decimales como
// sales.discount_amount: con 2, un monto tecleado en bolívares no vuelve redondo.
function leerDescuentoLinea(raw) {
  if (!raw || typeof raw !== "object") return null;
  const mode = raw.mode === "pct" || raw.mode === "amount" ? raw.mode : null;
  const value = parseFloat(raw.value);
  if (!mode || !Number.isFinite(value) || value <= 0) return null;
  if (mode === "pct" && value > 100) throw err("Un descuento no puede pasar del 100 %");
  return { mode, value: parseFloat(value.toFixed(5)) };
}

// Descuento TOTAL de la línea (no por unidad), como calcLineDiscount: nunca más que la línea,
// para que ningún producto salga con precio negativo. Misma cuenta que lineDiscountUsd/Bs en
// CartContext.
function calcDescuentoLinea(manual, unitPrice, qty) {
  const bruto = unitPrice * qty;
  const d = manual.mode === "pct" ? bruto * manual.value / 100 : manual.value;
  return parseFloat(Math.min(Math.max(d, 0), bruto).toFixed(5));
}

async function topeDescuento(company_id, transaction) {
  if (!company_id) return null;
  const row = await Setting.findOne({ where: { key: MAX_SETTING_KEY, company_id }, transaction });
  const tope = parseFloat(row?.value || 0);
  return Number.isFinite(tope) && tope > 0 ? tope : null;
}

// Quien da un descuento —por línea o el global de la venta— necesita `sales.discount`, y si no
// es administrador, quedarse dentro del tope de Configuración → Punto de venta.
//
// Los permisos se leen de la base y no del token: un permiso que se concede (o se quita) no
// llega al token hasta el próximo login, y el día que entró `sales.discount` habría dejado a
// cada cajero con sesión abierta sin poder dar el descuento que daba la víspera.
//
// `lineas`: [{ nombre, bruto, descuento }] solo con los descuentos MANUALES —las promociones
// las configura quien administra, no se controlan aquí—. `subtotal` y `global` en moneda base.
async function permisosVigentes(req, transaction) {
  let perms = req?.employee?.permissions;
  if (req?.employee?.id) {
    const emp = await Employee.findByPk(req.employee.id, {
      attributes: ["id"], include: [{ model: Role, attributes: ["permissions"] }], transaction,
    });
    if (emp?.Role) perms = emp.Role.permissions;
  }
  return perms;
}

async function assertDescuentosPermitidos(req, { lineas = [], subtotal = 0, global = 0 }, transaction) {
  const hayManual = lineas.some(l => l.descuento > 0);
  if (!hayManual && !(global > 0)) return;
  if (req?.is_superuser) return;

  const perms = await permisosVigentes(req, transaction);
  if (perms?.all) return;
  if (!hasPermission(perms, "sales.discount")) throw err("Tu usuario no tiene permiso para dar descuentos", 403);

  const tope = await topeDescuento(req.company_id ?? req.employee?.company_id, transaction);
  if (!tope) return;
  // Medio céntimo de holgura en el porcentaje: un monto tecleado en bolívares rara vez da el
  // 10 % exacto al pasarlo a la moneda base.
  const pasa = (desc, base) => base > 0 && (desc / base) * 100 > tope + 0.005;
  for (const l of lineas) {
    if (pasa(l.descuento, l.bruto)) throw err(`El descuento de "${l.nombre}" pasa del tope de ${tope} %`);
  }
  if (pasa(global, subtotal)) throw err(`El descuento de la venta pasa del tope de ${tope} %`);
}

// Neto de una línea de factura convertido a otra moneda (bolívares), con un solo redondeo por
// línea. Las líneas SIN descuento manual siguen la cuenta de siempre —neto por unidad redondeado
// × cantidad—, que es con la que se emitieron todas las facturas previas. Las que lo tienen
// restan el descuento de la LÍNEA entera: repartido por unidad, 200 Bs entre 12 unidades no se
// puede expresar en céntimos (16,666…) y la línea salía 8 céntimos distinta de lo tecleado.
// Espejo exacto de netoLineaEnTasa en frontend/src/helpers/currency.js y de la pista en
// bolívares de CartContext: los tres tienen que dar el mismo céntimo.
function netoLineaEnTasa(item, rate) {
  const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
  const r = parseFloat(rate) || 1;
  const qty = parseFloat(item.quantity ?? item.qty ?? 0);
  const price = parseFloat(item.price || 0);
  const value = parseFloat(item.line_discount_value);
  if (item.line_discount_mode && value > 0) {
    const bruto = round2(price * r) * qty;
    const desc = item.line_discount_mode === "amount" ? Math.min(round2(value * r), bruto) : bruto * value / 100;
    return round2(bruto - desc);
  }
  return round2((price - parseFloat(item.discount || 0)) * r) * qty;
}

module.exports = { leerDescuentoLinea, calcDescuentoLinea, assertDescuentosPermitidos, permisosVigentes, netoLineaEnTasa, MAX_SETTING_KEY };
