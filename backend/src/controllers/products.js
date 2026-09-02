const { getAll, getOne, createProduct, updateProduct, deleteProduct, setCatalogVisibility } = require("../services/products");
const { importProducts } = require("../services/products/importProducts");
const { broadcast } = require("../services/sseService");
const { assertWarehouseAccess } = require("../middleware/auth");

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
  getAll:  wrap(req => getAll({ ...req.query, company_id: req.employee?.company_id ?? null })),
  getOne:  wrap(req => getOne(req.params.id, req.employee?.company_id ?? null)),
  create:  wrap(async req => {
    const result = await createProduct({ body: req.body, file: req.file, company_id: req.employee?.company_id ?? null });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }, 201),
  update:  wrap(async req => {
    // El almacén desde el que se está editando: si viene, el precio, el costo y el mínimo
    // son de esa sucursal y no de la empresa entera. Se valida el acceso para que nadie
    // toque una sucursal ajena mandando otro id en el cuerpo.
    const wid = parseInt(req.body?.warehouse_id, 10) || null;
    if (wid) await assertWarehouseAccess(req, wid);

    const result = await updateProduct({
      id: req.params.id,
      body: req.body,
      file: req.file,
      company_id: req.employee?.company_id ?? null,
      warehouse_id: wid,
    });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  // Va aparte del `wrap` común: cuando el archivo trae filas mal, la respuesta tiene que
  // llevar el detalle de cuáles y por qué, y el wrap solo devuelve el mensaje.
  importar: async (req, res) => {
    try {
      const wid = parseInt(req.body?.warehouse_id, 10) || null;
      if (wid) await assertWarehouseAccess(req, wid);
      const result = await importProducts({
        rows: req.body?.rows,
        warehouse_id: wid,
        company_id: req.employee?.company_id ?? null,
      });
      broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
      res.json({ ok: true, ...result });
    } catch (err) {
      if (!err.isOperational) console.error(err);
      res.status(err.status || 500).json({
        ok: false,
        message: err.message || "No se pudo importar el archivo",
        ...(err.detalles ? { detalles: err.detalles } : {}),
      });
    }
  },
  setCatalogVisibility: wrap(async req => {
    const result = await setCatalogVisibility({
      ids: req.body.ids,
      visible: req.body.visible,
      company_id: req.employee?.company_id ?? null,
    });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  remove:  wrap(async req => {
    const result = await deleteProduct(req.params.id, req.employee?.company_id ?? null);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
};
