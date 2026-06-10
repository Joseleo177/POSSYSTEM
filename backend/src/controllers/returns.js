const { createReturn, getSaleReturns } = require("../services/returns");
const createExchange = require("../services/returns/exchangeService");
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

const cid = (req) => req.employee?.company_id ?? 0;

module.exports = {
  createReturn: wrap(async req => {
    const result = await createReturn({ saleId: parseInt(req.params.id), items: req.body.items, reason: req.body.reason, employee_id: req.employee?.id ?? null });
    broadcast(cid(req), 'products:updated', {});
    return result;
  }, 201),
  getSaleReturns: wrap(req => getSaleReturns(parseInt(req.params.id))),
  createExchange: wrap(async req => {
    const result = await createExchange({
      saleId:           parseInt(req.params.id),
      returnItems:      req.body.return_items,
      replacementItems: req.body.replacement_items,
      reason:           req.body.reason,
      employeeId:       req.employee?.id ?? null,
    });
    broadcast(cid(req), 'products:updated', {});
    return result;
  }, 201),
};
