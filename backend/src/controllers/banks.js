const {
  getAllBanks, createBank, updateBank, deleteBank, toggleBank,
  getAllMethods, createMethod, updateMethod, deleteMethod, toggleMethod,
} = require("../services/banks");

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
  getAllBanks:  wrap(req => getAllBanks()),
  createBank:  wrap(req => createBank(req.body), 201),
  updateBank:  wrap(req => updateBank(req.params.id, req.body)),
  deleteBank:  wrap(req => deleteBank(req.params.id)),
  toggleBank:  wrap(req => toggleBank(req.params.id)),
  getAllMethods: wrap(req => getAllMethods()),
  createMethod: wrap(req => createMethod(req.body), 201),
  updateMethod: wrap(req => updateMethod(req.params.id, req.body)),
  deleteMethod: wrap(req => deleteMethod(req.params.id)),
  toggleMethod: wrap(req => toggleMethod(req.params.id)),
};
