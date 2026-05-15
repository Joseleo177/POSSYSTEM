const svc = require("../services/quotations/quotationService");

const getAll = async (req, res, next) => {
  try {
    const result = await svc.getAll(req.query);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
};

const getOne = async (req, res, next) => {
  try {
    const q = await svc.getById(req.params.id);
    res.json({ ok: true, data: q });
  } catch (e) { next(e); }
};

const create = async (req, res, next) => {
  try {
    const q = await svc.create(req.body, req.employee?.id);
    res.status(201).json({ ok: true, data: q });
  } catch (e) { next(e); }
};

const cancel = async (req, res, next) => {
  try {
    const q = await svc.cancel(req.params.id);
    res.json({ ok: true, data: q });
  } catch (e) { next(e); }
};

const convert = async (req, res, next) => {
  try {
    const result = await svc.convert(req.params.id, req.body, req.employee?.id);
    res.json({ ok: true, data: result });
  } catch (e) { next(e); }
};

module.exports = { getAll, getOne, create, cancel, convert };
