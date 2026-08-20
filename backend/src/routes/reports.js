const router = require("express").Router();
const ctrl   = require("../controllers/reports");
const { auth, permit } = require("../middleware/auth");

router.get("/sales",              auth, permit("reports.view"), ctrl.getSalesReport);
router.get("/products",           auth, permit("reports.view"), ctrl.getProductsReport);
router.get("/receivables",        auth, permit("reports.view"), ctrl.getReceivablesReport);
router.get("/purchases",          auth, permit("reports.view"), ctrl.getPurchasesReport);
router.get("/inventory",          auth, permit("reports.view", "inventory.view"), ctrl.getInventoryReport);
router.get("/margins",            auth, permit("reports.view"), ctrl.getMarginsReport);
router.get("/customers-analysis", auth, permit("reports.view"), ctrl.getCustomersAnalysis);
router.get("/audit",              auth, permit("reports.audit"), ctrl.getAuditReport);
router.get("/expiry",             auth, permit("reports.view", "inventory.view"), ctrl.getExpiryReport);
// Lleva también "accounting": es información de caja, y quien gestiona contabilidad la
// necesita aunque no tenga acceso al resto de reportes.
router.get("/payment-journals",   auth, permit("reports.view", "journals.view"), ctrl.getPaymentJournalsReport);

module.exports = router;
