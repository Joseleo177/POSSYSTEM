const svc = require("../services/products/variantService");
const { assertWarehouseAccess } = require("../middleware/auth");
const { assertProductAccess, existenciaEn } = require("../services/products/productAccess");

// Atributos de variante (Talla, Color) y sus valores. JSON sin archivos: no pasan por multer,
// pero el company_id va igual a mano porque el servicio también lo usa desde el guardado del
// producto, que sí pasa por multer.
const wrap = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req, req.employee?.company_id ?? null);
    res.status(status).json({ ok: true, ...result });
  } catch (err) {
    if (!err.isOperational) console.error(err);
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  getAll:       wrap((req, cid) => svc.listAttributes(cid)),
  create:       wrap((req, cid) => svc.createAttribute(req.body || {}, cid), 201),
  rename:       wrap((req, cid) => svc.renameAttribute(req.params.id, req.body?.name, cid)),
  remove:       wrap((req, cid) => svc.removeAttribute(req.params.id, cid)),
  addValues:    wrap((req, cid) => svc.addValues(req.params.id, req.body?.values ?? req.body?.value, cid), 201),
  renameValue:  wrap((req, cid) => svc.renameValue(req.params.id, req.params.valueId, req.body?.value, cid)),
  removeValue:  wrap((req, cid) => svc.removeValue(req.params.id, req.params.valueId, cid)),
  reorder:      wrap((req, cid) => svc.reorderValues(req.params.id, req.body?.ids, cid)),
  // Variantes de un modelo, con las existencias de la sucursal si se pide una.
  variants:     wrap(async (req, cid) => {
    let wid = parseInt(req.query.warehouse_id, 10) || null;
    if (wid) await assertWarehouseAccess(req, wid);
    const visibles = await assertProductAccess(req, req.params.id);
    // Sin almacén, la existencia de cada variante es el total de la empresa. Fuera del admin
    // se da la de sus sucursales: la única si tiene una, o la suma de las suyas.
    if (visibles && !wid && visibles.length === 1) wid = visibles[0];
    const r = await svc.getVariants(req.params.id, { warehouse_id: wid, company_id: cid, visible_ids: visibles });
    if (visibles && !wid) {
      const aqui = await existenciaEn(r.data.variants.map(v => v.id), visibles);
      for (const v of r.data.variants) v.qty = aqui.get(v.id) ?? 0;
    }
    return r;
  }),
};
