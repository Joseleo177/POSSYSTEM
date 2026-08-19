const { buildTenantContext, sanitizeDate } = require("../services/reports/shared");
const {
  salesReport,
  productsReport,
  receivablesReport,
  purchasesReport,
  inventoryReport,
  marginsReport,
  customersReport,
  auditReport,
  expiryReport,
  paymentJournalsReport,
} = require("../services/reports");

const wrap = (fn, errMsg) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: errMsg || err.message });
  }
};

const getSalesReport = wrap(
  async req => salesReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de ventas"
);

const getProductsReport = wrap(
  async req => productsReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de productos"
);

const getReceivablesReport = wrap(
  async req => receivablesReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de cuentas por cobrar"
);

const getPurchasesReport = wrap(
  async req => purchasesReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de compras"
);

const getInventoryReport = wrap(
  async req => inventoryReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de inventario"
);

const getMarginsReport = wrap(
  async req => marginsReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de márgenes"
);

const getCustomersAnalysis = wrap(
  async req => customersReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar análisis de clientes"
);

const getAuditReport = wrap(
  async req => auditReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de auditoría"
);

const getExpiryReport = wrap(
  async req => expiryReport(await buildTenantContext(req)),
  "Error al generar reporte de vencimientos"
);

const getPaymentJournalsReport = wrap(
  async req => paymentJournalsReport({ ...req.query, ...(await buildTenantContext(req)) }),
  "Error al generar reporte de diarios de pago"
);

module.exports = {
  getSalesReport,
  getProductsReport,
  getReceivablesReport,
  getPurchasesReport,
  getInventoryReport,
  getMarginsReport,
  getCustomersAnalysis,
  getAuditReport,
  getExpiryReport,
  getPaymentJournalsReport,
};
