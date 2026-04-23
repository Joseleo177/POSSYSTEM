const { getAll, getOne, createProduct, updateProduct, deleteProduct } = require("../services/products");

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
  getAll:  wrap(req => getAll(req.query)),
  getOne:  wrap(req => getOne(req.params.id)),
  create:  wrap(req => createProduct({ body: req.body, file: req.file, company_id: req.employee?.company_id ?? null }), 201),
  update:  wrap(req => updateProduct({ id: req.params.id, body: req.body, file: req.file, company_id: req.employee?.company_id ?? null })),
  remove:  wrap(req => deleteProduct(req.params.id)),
};
