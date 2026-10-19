const { getAll, getOne, createPurchase, updateDraft, confirmOrder, receivePurchase, updateItemLots, deletePurchase, getPayables, setDueDate } = require("../services/purchases");
const { broadcast } = require("../services/sseService");
const { assertLineasAccess } = require("../services/products/productAccess");
const { PurchaseItem } = require("../models");

const wrap = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(status).json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    let msg = err.message || "Error al procesar la orden de compra";
    if (msg.includes('null value in column "warehouse_id"') || msg.includes('warehouse_id')) {
      msg = "Debe seleccionar un almacén de destino antes de recibir la mercancía";
    } else if (msg.includes('violates not-null constraint')) {
      msg = "Por favor completa todos los campos obligatorios antes de procesar";
    } else if (msg.includes('violates foreign key constraint')) {
      msg = "El proveedor o almacén seleccionado no es válido o ya no existe";
    }
    res.status(err.status || 400).json({ ok: false, message: msg });
  }
};

const companyId = (req) => req.employee?.company_id ?? 0;

module.exports = {
  getAll:       wrap(req => getAll(req.query, req)),
  getOne:       wrap(req => getOne(req.params.id, req)),
  create:       wrap(async req => {
    await assertLineasAccess(req, req.body?.items);
    return createPurchase({ body: req.body, employee_id: req.employee?.id ?? null });
  }, 201),
  updateDraft:  wrap(async req => {
    // Lo que la orden ya tenía guardado se autorizó al agregarlo; solo se validan los nuevos.
    const previos = await PurchaseItem.findAll({ where: { purchase_id: req.params.id }, attributes: ["product_id"], raw: true });
    await assertLineasAccess(req, req.body?.items, previos.map(p => p.product_id));
    return updateDraft(req.params.id, req.body, req);
  }),
  confirm:      wrap(req => confirmOrder(req.params.id, req)),
  receive:      wrap(async req => {
    const result = await receivePurchase(req.params.id, req);
    broadcast(companyId(req), 'products:updated', {});
    return result;
  }),
  updateLots:   wrap(req => updateItemLots(req.params.id, req.body.items || [], req)),
  payables:     wrap(req => getPayables(req.query, req)),
  setDueDate:   wrap(req => setDueDate(req.params.id, req.body, req)),
  remove:       wrap(async req => { const r = await deletePurchase(req.params.id, req); broadcast(companyId(req), 'products:updated', {}); return r; }),
};
