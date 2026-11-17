const router = require("express").Router();
const { auth, permit, hasPermission } = require("../middleware/auth");
const { buildTenantContext } = require("../services/reports/shared");
const svc = require("../services/tips");
const personas = require("../services/commissions");

// Propinas: un extra que el superusuario enciende por empresa (companies.propinas_enabled). Sin
// él, ninguna ruta responde aunque el rol tenga los permisos. Las personas son las mismas de
// Comisiones (tabla sellers).
const moduloActivo = async (req, res, next) => {
  try {
    if (!(await svc.propinasActivas(req.company_id))) {
      return res.status(403).json({ ok: false, message: "Las propinas no están activas para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

const enviar = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, ...(await fn(req)) }); }
  catch (err) {
    if (err.isOperational) return res.status(err.status || 400).json({ ok: false, message: err.message });
    next(err);
  }
};

const conSucursal = async (req) => {
  const tc = await buildTenantContext(req);
  if (req.query.warehouse_id && Array.isArray(tc.allowedWarehouses) && !tc.allowedWarehouses.includes(parseInt(req.query.warehouse_id))) {
    throw Object.assign(new Error("No tienes acceso a este almacén"), { status: 403, isOperational: true });
  }
  return { company_id: req.company_id, ...req.query, wh: tc.wh };
};

// Personal: la caja lo lista para elegir el mesonero (va con cobrar). Sin el % de comisión ni datos
// personales: el cajero no los necesita.
router.get("/staff", permit("sales.create", "tips.view", "tips.manage"), enviar(async (req) => {
  const data = await personas.listSellers({ all: req.query.all === "1" });
  // Quien administra propinas ve la ficha (cédula, teléfono); la caja, solo el nombre y el código.
  const veFicha = ["tips.view", "tips.manage"].some(p => hasPermission(req.employee?.permissions, p));
  return { data: data.map(({ commission_pct, doc_id, phone, ...s }) => (veFicha ? { ...s, doc_id, phone } : s)) }; // eslint-disable-line no-unused-vars
}));
// Usuarios de la empresa, para ligar a cada persona con el usuario con que entra a la tablet: así
// las rondas del mesonero le asignan la propina solas.
router.get("/users", permit("tips.manage"), enviar(async () => {
  const { Employee } = require("../models");
  const filas = await Employee.findAll({ where: { active: true }, attributes: ["id", "full_name", "username"], order: [["full_name", "ASC"]] });
  return { data: filas.map(e => e.toJSON()) };
}));
// Crear y editar personas desde Propinas. El % de comisión no se toca desde aquí: se conserva.
router.post("/staff", permit("tips.manage"), enviar(async (req) =>
  ({ data: await personas.saveSeller(null, { commission_pct: 0, ...req.body }) })));
router.put("/staff/:id", permit("tips.manage"), enviar(async (req) => {
  const { Seller } = require("../models");
  const actual = await Seller.findByPk(parseInt(req.params.id), { attributes: ["commission_pct"] });
  return { data: await personas.saveSeller(parseInt(req.params.id), { ...req.body, commission_pct: actual?.commission_pct ?? 0 }) };
}));

router.get("/report", permit("tips.view"), enviar(async (req) => svc.report(await conSucursal(req))));
router.get("/staff/:id/statement", permit("tips.view"), enviar(async (req) =>
  ({ data: await svc.statement(parseInt(req.params.id), { company_id: req.company_id, ...req.query }) })));

// Facturas con propina y el historial de cambios de cada una.
router.get("/sales", permit("tips.view"), enviar(async (req) => svc.sales(await conSucursal(req))));
router.get("/sales/:id/history", permit("tips.view"), enviar(async (req) => svc.history(req.params.id)));
router.put("/sales/:id/assignee", permit("tips.reassign"), enviar(async (req) => svc.reassign(req.params.id, req.body, req)));

router.post("/staff/:id/payouts", permit("tips.pay"), enviar(async (req) =>
  ({ data: await svc.createPayout(parseInt(req.params.id), req.body, req) })));
router.post("/pool/payouts", permit("tips.pay"), enviar(async (req) => ({ data: await svc.createPoolPayout(req.body, req) })));
router.delete("/payouts/:id", permit("tips.pay"), enviar(async (req) => svc.voidPayout(parseInt(req.params.id), req)));

module.exports = router;
