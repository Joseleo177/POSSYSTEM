const { getPayments, createPayment, removePayment } = require("../services/purchasePayments");

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
  getPayments:   wrap(req => getPayments(parseInt(req.params.id))),
  createPayment: wrap(req => createPayment(parseInt(req.params.id), req.body, req.employee?.id ?? null), 201),
  removePayment: wrap(req => removePayment(parseInt(req.params.id))),
};
