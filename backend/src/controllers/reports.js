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
  req => salesReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de ventas"
);

const getProductsReport = wrap(
  req => productsReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de productos"
);

const getReceivablesReport = wrap(
  req => receivablesReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de cuentas por cobrar"
);

const getPurchasesReport = wrap(
  req => purchasesReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de compras"
);

const getInventoryReport = wrap(
  req => inventoryReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de inventario"
);

const getMarginsReport = wrap(
  req => marginsReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de márgenes"
);

const getCustomersAnalysis = wrap(
  req => customersReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar análisis de clientes"
);

const getAuditReport = wrap(
  req => auditReport({ ...req.query, ...buildTenantContext(req) }),
  "Error al generar reporte de auditoría"
);

const getExpiryReport = wrap(
  () => expiryReport(),
  "Error al generar reporte de vencimientos"
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
};
