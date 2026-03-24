const router = require("express").Router();
const ctrl   = require("../controllers/reports");
const { auth, permit } = require("../middleware/auth");

router.get("/sales",              auth, permit("reports", "config"), ctrl.getSalesReport);
router.get("/products",           auth, permit("reports", "config"), ctrl.getProductsReport);
router.get("/receivables",        auth, permit("reports", "config"), ctrl.getReceivablesReport);
router.get("/purchases",          auth, permit("reports", "config"), ctrl.getPurchasesReport);
router.get("/inventory",          auth, permit("reports", "config", "inventory"), ctrl.getInventoryReport);
router.get("/margins",            auth, permit("reports", "config"), ctrl.getMarginsReport);
router.get("/customers-analysis", auth, permit("reports", "config"), ctrl.getCustomersAnalysis);
router.get("/audit",              auth, permit("config"), ctrl.getAuditReport);

module.exports = router;
