const router = require("express").Router();
const { auth, permit, hasPermission } = require("../middleware/auth");
const { buildTenantContext } = require("../services/reports/shared");
const svc = require("../services/commissions");

// Comisiones por vendedor: un extra que el superusuario enciende por empresa
// (companies.comisiones_enabled). Sin él, ninguna ruta responde aunque el rol tenga los permisos.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["comisiones_enabled"] }) : null;
    if (!company?.comisiones_enabled) {
      return res.status(403).json({ ok: false, message: "Las comisiones por vendedor no están activas para esta empresa" });
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

// La caja lista los vendedores activos para elegir quién vendió: va con cobrar, no con ver
// comisiones (el cajero no debe ver cuánto gana cada uno).
router.get("/sellers", permit("sales.create", "commissions.view", "commissions.manage"), enviar(async (req) => {
  const todos = req.query.all === "1";
  const data = await svc.listSellers({ all: todos });
  // El % solo lo ve quien administra comisiones.
  const veMontos = ["commissions.view", "commissions.manage"].some(p => hasPermission(req.employee?.permissions, p));
  return { data: veMontos ? data : data.map(({ commission_pct, doc_id, phone, ...s }) => s) }; // eslint-disable-line no-unused-vars
}));
router.post("/sellers",     permit("commissions.manage"), enviar(async (req) => ({ data: await svc.saveSeller(null, req.body) })));
router.put ("/sellers/:id", permit("commissions.manage"), enviar(async (req) => ({ data: await svc.saveSeller(parseInt(req.params.id), req.body) })));

router.get("/report", permit("commissions.view"), enviar(async (req) => {
  const tc = await buildTenantContext(req);
  if (req.query.warehouse_id && Array.isArray(tc.allowedWarehouses) && !tc.allowedWarehouses.includes(parseInt(req.query.warehouse_id))) {
    throw Object.assign(new Error("No tienes acceso a este almacén"), { status: 403, isOperational: true });
  }
  return svc.report({ company_id: req.company_id, ...req.query, wh: tc.wh });
}));

router.get("/sellers/:id/statement", permit("commissions.view"), enviar(async (req) =>
  ({ data: await svc.statement(parseInt(req.params.id), { company_id: req.company_id, ...req.query }) })));

router.post("/sellers/:id/payouts", permit("commissions.pay"), enviar(async (req) =>
  ({ data: await svc.createPayout(parseInt(req.params.id), req.body, req) })));
router.delete("/payouts/:id", permit("commissions.pay"), enviar(async (req) => svc.voidPayout(parseInt(req.params.id), req)));

module.exports = router;
