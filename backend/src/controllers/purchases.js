const { getAll, getOne, createPurchase, updateDraft, confirmOrder, receivePurchase, updateItemLots, deletePurchase } = require("../services/purchases");
const { broadcast } = require("../services/sseService");

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
  getOne:       wrap(req => getOne(req.params.id)),
  create:       wrap(req => createPurchase({ body: req.body, employee_id: req.employee?.id ?? null }), 201),
  updateDraft:  wrap(req => updateDraft(req.params.id, req.body)),
  confirm:      wrap(req => confirmOrder(req.params.id)),
  receive:      wrap(async req => {
    const result = await receivePurchase(req.params.id);
    broadcast(companyId(req), 'products:updated', {});
    return result;
  }),
  updateLots:   wrap(req => updateItemLots(req.params.id, req.body.items || [])),
  remove:       wrap(async req => { const r = await deletePurchase(req.params.id); broadcast(companyId(req), 'products:updated', {}); return r; }),
};
