const {
  getAll, getByEmployee, createWarehouse, updateWarehouse, deleteWarehouse, assignEmployees,
  getStock, getProducts, addStock, setStock, removeStock,
  createTransfer, getTransfers,
} = require("../services/warehouses");

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
  getAll:           wrap(() => getAll()),
  getByEmployee:    wrap(req => getByEmployee(req.params.employeeId)),
  create:           wrap(req => createWarehouse(req.body), 201),
  update:           wrap(req => updateWarehouse(req.params.id, req.body)),
  remove:           wrap(req => deleteWarehouse(req.params.id)),
  assignEmployees:  wrap(req => assignEmployees(req.params.id, req.body.employee_ids)),
  getStock:         wrap(req => getStock(req)),
  getProducts:      wrap(req => getProducts(req)),
  addStock:         wrap(req => addStock(req)),
  setStock:         wrap(req => setStock(req)),
  removeStock:      wrap(req => removeStock(req)),
  transfer:         wrap(req => createTransfer(req), 201),
  getTransfers:     wrap(req => getTransfers(req)),
};
