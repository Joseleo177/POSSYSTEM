const {
  getAll, getByEmployee, createWarehouse, updateWarehouse, deleteWarehouse, assignEmployees,
  getStock, getProducts, addStock, setStock, removeStock,
  createTransfer, getTransfers,
  getActiveSession, openSession, addLine, closeSession, getSessions,
} = require("../services/warehouses");
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
const stockBroadcast = (req) => broadcast(cid(req), 'products:updated', {});

module.exports = {
  getAll:           wrap(() => getAll()),
  getByEmployee:    wrap(req => getByEmployee(req.params.employeeId)),
  create:           wrap(req => createWarehouse(req.body), 201),
  update:           wrap(req => updateWarehouse(req.params.id, req.body)),
  remove:           wrap(req => deleteWarehouse(req.params.id)),
  assignEmployees:  wrap(req => assignEmployees(req.params.id, req.body.employee_ids)),
  getStock:         wrap(req => getStock(req)),
  getProducts:      wrap(req => getProducts(req)),
  addStock:         wrap(async req => { const r = await addStock(req);    stockBroadcast(req); return r; }),
  setStock:         wrap(async req => { const r = await setStock(req);    stockBroadcast(req); return r; }),
  removeStock:      wrap(async req => { const r = await removeStock(req); stockBroadcast(req); return r; }),
  transfer:         wrap(async req => { const r = await createTransfer(req); stockBroadcast(req); return r; }, 201),
  getTransfers:     wrap(req => getTransfers(req)),
  getActiveSession: wrap(req => getActiveSession(req.params.id, req)),
  openSession:      wrap(req => openSession(req.params.id, req), 201),
  addLine:          wrap(async req => { const r = await addLine(req.params.id, req.params.sessionId, req.body, req); stockBroadcast(req); return r; }, 201),
  closeSession:     wrap(async req => { const r = await closeSession(req.params.id, req.params.sessionId, req.body, req); stockBroadcast(req); return r; }),
  getSessions:      wrap(req => getSessions(req.params.id, req.query, req)),
};
