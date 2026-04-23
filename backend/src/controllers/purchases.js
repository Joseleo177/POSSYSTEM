const { getAll, getOne, createPurchase, deletePurchase } = require("../services/purchases");

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
  getAll:  wrap(req => getAll(req.query, req)),
  getOne:  wrap(req => getOne(req.params.id)),
  create:  wrap(req => createPurchase({ body: req.body, employee_id: req.employee?.id ?? null }), 201),
  remove:  wrap(req => deletePurchase(req.params.id)),
};
