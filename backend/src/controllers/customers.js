const { getAll, getOne, getCustomerPurchases, createCustomer, updateCustomer, deleteCustomer } = require("../services/customers");

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
  getAll:       wrap(req => getAll(req.query, req)),
  getOne:       wrap(req => getOne(req.params.id)),
  getPurchases: wrap(req => getCustomerPurchases(req.params.id, req.query)),
  create:       wrap(req => createCustomer(req.body), 201),
  update:       wrap(req => updateCustomer(req.params.id, req.body)),
  remove:       wrap(req => deleteCustomer(req.params.id)),
};
