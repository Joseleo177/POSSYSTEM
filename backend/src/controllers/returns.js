const { createReturn, getSaleReturns } = require("../services/returns");

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
  createReturn:   wrap(req => createReturn({ saleId: parseInt(req.params.id), items: req.body.items, reason: req.body.reason, employee_id: req.employee?.id ?? null }), 201),
  getSaleReturns: wrap(req => getSaleReturns(parseInt(req.params.id))),
};
