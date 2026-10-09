const svc = require("../services/bankReconciliation");

const handle = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req);
    res.json({ ok: true, ...out });
  } catch (err) { next(err); }
};

exports.accounts  = handle(req => svc.listAccounts(req));
exports.list      = handle(req => svc.list(req, req.query));
exports.create    = handle(req => svc.create(req, req.body));
exports.getOne    = handle(req => svc.getOne(req, req.params.id));
exports.auto      = handle(req => svc.auto(req, req.params.id));
exports.remove    = handle(req => svc.remove(req, req.params.id));
exports.charges   = handle(req => svc.registerCharges(req, req.params.id, req.body));
exports.candidates = handle(req => svc.candidates(req, req.params.id, req.params.lineId, req.query));
exports.match     = handle(req => svc.match(req, req.params.id, req.params.lineId, req.body));
exports.register  = handle(req => svc.register(req, req.params.id, req.params.lineId, req.body));
exports.ignore    = handle(req => svc.ignore(req, req.params.id, req.params.lineId, req.body));
exports.unmatch   = handle(req => svc.unmatch(req, req.params.id, req.params.lineId));
