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

// create y update pasan company_id a mano: al aceptar el logo, la petición va por multipart
// y multer rompe el AsyncLocalStorage que lleva el tenant (mismo motivo que categories.js).
const tenant = (req) => req.employee?.company_id ?? null;

module.exports = {
  getAllBanks:  wrap(req => getAllBanks()),
  createBank:  wrap(req => createBank(req.body, req.file, tenant(req)), 201),
  updateBank:  wrap(req => updateBank(req.params.id, req.body, req.file, tenant(req))),
  deleteBank:  wrap(req => deleteBank(req.params.id)),
  toggleBank:  wrap(req => toggleBank(req.params.id)),
  getAllMethods: wrap(req => getAllMethods()),
  createMethod: wrap(req => createMethod(req.body, req.file, tenant(req)), 201),
  updateMethod: wrap(req => updateMethod(req.params.id, req.body, req.file, tenant(req))),
  deleteMethod: wrap(req => deleteMethod(req.params.id)),
  toggleMethod: wrap(req => toggleMethod(req.params.id)),
};
