const svc = require("../services/kitchen");

const handle = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req);
    res.json({ ok: true, ...out });
  } catch (err) { next(err); }
};

exports.board     = handle(req => svc.board(req, req.query));
exports.setStatus = handle(req => svc.setStatus(req, req.params.id, req.body));
exports.fromSale  = handle(req => svc.fromSale(req, req.params.id, req.body));
