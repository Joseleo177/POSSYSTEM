const { getAll, getOne, createProduct, updateProduct, deleteProduct, setCatalogVisibility, backfillImagesByBarcode, setVariantImage } = require("../services/products");
const { importProducts } = require("../services/products/importProducts");
const { broadcast } = require("../services/sseService");
const { assertWarehouseAccess, visibleWarehouseIds, isAdmin } = require("../middleware/auth");
const { assertProductAccess, idsVisibles, noEncontrado } = require("../services/products/productAccess");
const { ProductStock, Sequelize } = require("../models");

const prohibido = (message) => Object.assign(new Error(message), { status: 403, isOperational: true });

// Listado de productos según quién pregunta. El admin ve la empresa entera. El resto, solo lo
// de sus sucursales (ver services/products/productAccess.js), con una única excepción:
// reconocer por su código de barras EXACTO un producto que ya tiene otra sucursal —al crearlo
// o al registrarlo en la propia— para traerlo en vez de duplicarlo. Esa consulta devuelve el
// producto pero no su existencia, que es de otras tiendas.
async function listar(req) {
  const company_id = req.employee?.company_id ?? null;
  const q = { ...req.query };
  const visibles = await visibleWarehouseIds(req);
  if (!visibles) return getAll({ ...q, company_id });

  if (q.warehouse_id) await assertWarehouseAccess(req, q.warehouse_id);
  if (q.not_in_warehouse_id) await assertWarehouseAccess(req, q.not_in_warehouse_id);

  const codigo = String(q.barcode || "").trim();
  if ((q.for_purchase || q.not_in_warehouse_id) && codigo) {
    const r = await getAll({ ...q, barcode: codigo, limit: 1, offset: 0, company_id });
    for (const p of r.data) { delete p.stock; delete p.comboItems; }
    return r;
  }
  // Sin código exacto, "lo que todavía no tiene mi sucursal" es el catálogo de las demás.
  if (q.not_in_warehouse_id) return { data: [], total: 0 };
  delete q.for_purchase;

  // Con una sola sucursal, pedir "sin almacén" es pedir esa: así llegan también su precio,
  // su costo y su existencia, y no los generales.
  if (!q.warehouse_id && visibles.length === 1) q.warehouse_id = String(visibles[0]);
  return getAll({ ...q, company_id, visible_ids: visibles });
}

const wrap = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(status).json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// Fotos adicionales. Todas pasan por el acceso a la sucursal del producto, y company_id va a
// mano porque la subida lleva multer (ver services/products/productImages.js).
const fotos = require("../services/products/productImages");
const conFoto = (fn) => wrap(async req => {
  await assertProductAccess(req, req.params.id);
  const args = {
    productId: parseInt(req.params.id, 10),
    imageId: parseInt(req.params.imageId, 10) || null,
    company_id: req.employee?.company_id ?? null,
  };
  const result = await fn(args, req);
  if (req.method !== "GET") broadcast(args.company_id ?? 0, 'products:updated', {});
  return result;
});

module.exports = {
  images: {
    listar:         conFoto(a => fotos.listar(a.productId, a.company_id)),
    agregar:        conFoto((a, req) => fotos.agregar({ ...a, file: req.file, label: req.body?.label })),
    renombrar:      conFoto((a, req) => fotos.renombrar({ ...a, label: req.body?.label })),
    ordenar:        conFoto((a, req) => fotos.ordenar({ ...a, ids: req.body?.ids })),
    hacerPrincipal: conFoto(a => fotos.hacerPrincipal(a)),
    eliminar:       conFoto(a => fotos.eliminar(a)),
  },
  // Foto por color de un modelo con variantes (multer: company_id a mano).
  variantImage: wrap(async req => {
    await assertProductAccess(req, req.params.id);
    const result = await setVariantImage({
      modelId: req.params.id,
      attribute_value_id: req.body?.attribute_value_id,
      remove: req.body?.remove,
      file: req.file,
      company_id: req.employee?.company_id ?? null,
    });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  getAll:  wrap(listar),
  // Catálogo PDF y lista de precios. Quien no es admin solo ve los productos de sus sucursales.
  //  - La LISTA de precios es de todas las empresas (12-11-2026).
  //  - El catálogo con fotos es un extra por empresa (companies.catalogo_pdf_enabled): sin él
  //    no responde, aunque el rol tenga permiso para ver productos.
  //  - El precio al mayor solo viaja a la empresa que vende al mayor (mayor_enabled). Sin
  //    ella el catálogo con fotos sale con el precio normal (pedido 12-11-2026).
  // Con `warehouse_id` (la sucursal que muestra el catálogo) salen sus productos y SUS precios:
  // el PDF tiene que decir lo mismo que cobra la caja de esa sucursal.
  catalogPdf: wrap(async req => {
    const { datosCatalogo } = require("../services/products/catalogPdf");
    const { Company } = require("../models");
    const esLista = req.query.formato === "lista";
    const empresa = req.employee?.company_id
      ? await Company.findByPk(req.employee.company_id, { attributes: ["catalogo_pdf_enabled", "mayor_enabled"] })
      : null;
    if (!esLista && !empresa?.catalogo_pdf_enabled) throw prohibido("El catálogo PDF no está activado para esta empresa");
    const wid = parseInt(req.query.warehouse_id, 10) || null;
    if (wid) await assertWarehouseAccess(req, wid);
    return datosCatalogo({
      company_id: req.employee?.company_id ?? null,
      visibles: wid ? [wid] : await visibleWarehouseIds(req),
      warehouse_id: wid,
      con_mayor: !!empresa?.mayor_enabled,
      category_ids: req.query.category_ids,
      solo_publicados: req.query.solo_publicados,
      formato: req.query.formato,
    });
  }),
  getOne:  wrap(async req => {
    const visibles = await assertProductAccess(req, req.params.id);
    return getOne(req.params.id, req.employee?.company_id ?? null, visibles);
  }),
  create:  wrap(async req => {
    const result = await createProduct({ body: req.body, file: req.file, company_id: req.employee?.company_id ?? null });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }, 201),
  update:  wrap(async req => {
    // El almacén desde el que se está editando: si viene, el precio, el costo y el mínimo
    // son de esa sucursal y no de la empresa entera. Se valida el acceso para que nadie
    // toque una sucursal ajena mandando otro id en el cuerpo.
    let wid = parseInt(req.body?.warehouse_id, 10) || null;
    if (wid) await assertWarehouseAccess(req, wid);
    const visibles = await assertProductAccess(req, req.params.id);
    // Sin sucursal, la edición escribe el precio, el costo y el mínimo GENERALES, los que
    // heredan todas las tiendas. Eso es del admin: el resto edita siempre desde la suya.
    if (visibles && !wid) {
      if (visibles.length !== 1) throw Object.assign(new Error("Indica la sucursal en la que editas el producto"), { status: 400, isOperational: true });
      wid = visibles[0];
    }

    const result = await updateProduct({
      id: req.params.id,
      body: req.body,
      file: req.file,
      company_id: req.employee?.company_id ?? null,
      warehouse_id: wid,
      // Al guardar un modelo, las variantes que este usuario no ve (las de otras sucursales)
      // no vienen en la lista y no deben tomarse como quitadas.
      visible_ids: visibles,
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
      // Sin sucursal, la plantilla pisa los precios generales de toda la empresa: solo admin.
      if (!wid && !isAdmin(req)) throw prohibido("Elige la sucursal a la que importas los productos");
      const result = await importProducts({
        rows: req.body?.rows,
        warehouse_id: wid,
        company_id: req.employee?.company_id ?? null,
        employee_id: req.employee?.id ?? null,
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
  // Recorre todos los productos sin foto de la empresa, de todas las sucursales: solo admin.
  backfillImages: wrap(async req => {
    if (!isAdmin(req)) throw prohibido("Solo el administrador puede sincronizar las fotos de toda la empresa");
    const result = await backfillImagesByBarcode({
      company_id: req.employee?.company_id ?? null,
      limit: req.body?.limit,
      after_id: req.body?.after_id,
    });
    if (result.data?.actualizados) broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  setCatalogVisibility: wrap(async req => {
    const pedidos = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const visibles = await visibleWarehouseIds(req);
    const propios = await idsVisibles(pedidos, visibles);
    if (visibles && propios.length !== new Set(pedidos.map(n => parseInt(n, 10))).size) throw noEncontrado();
    const result = await setCatalogVisibility({
      ids: propios,
      visible: req.body.visible,
      company_id: req.employee?.company_id ?? null,
    });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
  remove:  wrap(async req => {
    // Borrar un producto lo borra de la EMPRESA. Si otra sucursal lo maneja, a quien no es
    // admin solo le corresponde sacarlo de la suya, desde Stock.
    const visibles = await assertProductAccess(req, req.params.id);
    if (visibles) {
      const ajenas = await ProductStock.count({
        where: { product_id: req.params.id, warehouse_id: { [Sequelize.Op.notIn]: visibles } },
      });
      if (ajenas) throw prohibido("Otra sucursal también maneja este producto. Para dejar de manejarlo en la tuya, quítalo desde Stock");
    }
    const result = await deleteProduct(req.params.id, req.employee?.company_id ?? null);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    return result;
  }),
};
