const { getAll, createJournal, updateJournal, deleteJournal, getSummary, getMovements } = require("../services/paymentJournals");

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
  getAll:     wrap(req => getAll(req)),
  create:     wrap(req => createJournal(req.body), 201),
  update:     wrap(req => updateJournal(req.params.id, req.body)),
  remove:     wrap(req => deleteJournal(req.params.id)),
  summary:    wrap(req => getSummary(req)),
  movements:  wrap(req => getMovements(req)),
};
