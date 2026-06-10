const { getAll, getOne, createProduct, updateProduct, deleteProduct } = require("../services/products");
const { broadcast } = require("../services/sseService");

const wrap = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(status).json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  getAll:  wrap(req => getAll({ ...req.query, company_id: req.employee?.company_id ?? null })),
  getOne:  wrap(req => getOne(req.params.id, req.employee?.company_id ?? null)),
  create:  wrap(async req => {
    const result = await createProduct({ body: req.body, file: req.file, company_id: req.employee?.company_id ?? null });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }, 201),
  update:  wrap(async req => {
    const result = await updateProduct({ id: req.params.id, body: req.body, file: req.file, company_id: req.employee?.company_id ?? null });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  remove:  wrap(async req => {
    const result = await deleteProduct(req.params.id, req.employee?.company_id ?? null);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
};
