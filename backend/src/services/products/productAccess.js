const { sequelize, Sequelize } = require("../../models");
const { visibleWarehouseIds } = require("../../middleware/auth");

// Qué productos ve quien no es admin. El catálogo es de la empresa, pero cada sucursal opera
// solo lo suyo: un encargado no lista, abre, edita ni borra lo que manejan las otras tiendas.
//
// Un producto es "de" un conjunto de almacenes cuando:
//  - tiene ficha (product_stock) en alguno de ellos;
//  - es un modelo con variantes y alguna variante tiene ficha ahí (el modelo no lleva ficha);
//    Cada VARIANTE cuenta por sí sola: que la sucursal tenga la talla S de un modelo no le
//    muestra las M, L y XL que maneja otra.
//  - no tiene ficha en ninguna parte, ni él ni sus variantes: los combos y servicios
//    globales, creados antes de que existieran por almacén, y el recién creado sin almacén.
//
// Esto es un filtro de VISIBILIDAD. Reconocer un producto de otra sucursal por su código de
// barras exacto, para traerlo en vez de duplicarlo, es una excepción que decide el controlador.

const listaIds = (ids) => ids.map(n => parseInt(n, 10)).filter(Number.isInteger).join(",") || "NULL";

function condicionSucursal(alias, ids) {
  const lista = listaIds(ids);
  return `(
    EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = ${alias}."id" AND ps.warehouse_id IN (${lista}))
    OR EXISTS (SELECT 1 FROM products v JOIN product_stock vps ON vps.product_id = v.id
                WHERE v.parent_id = ${alias}."id" AND vps.warehouse_id IN (${lista}))
    OR (NOT EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = ${alias}."id")
        AND NOT EXISTS (SELECT 1 FROM products v JOIN product_stock vps ON vps.product_id = v.id
                         WHERE v.parent_id = ${alias}."id"))
  )`;
}

const noEncontrado = () => Object.assign(new Error("Producto no encontrado"), { status: 404, isOperational: true });

// De estos ids, los que el usuario puede ver. `null` = admin, ve todos.
async function idsVisibles(ids, visibles) {
  if (!visibles) return ids;
  const limpios = ids.map(n => parseInt(n, 10)).filter(Number.isInteger);
  if (!limpios.length) return [];
  const filas = await sequelize.query(
    `SELECT p.id FROM products p WHERE p.id IN (:ids) AND ${condicionSucursal("p", visibles)}`,
    { replacements: { ids: limpios }, type: Sequelize.QueryTypes.SELECT }
  );
  return filas.map(f => f.id);
}

// 404 y no 403: a quien no le corresponde, el producto no existe. Devuelve los almacenes
// visibles (null para el admin) para que el llamador no los vuelva a consultar.
async function assertProductAccess(req, productId) {
  const visibles = await visibleWarehouseIds(req);
  if (!visibles) return null;
  const [ok] = await idsVisibles([productId], visibles);
  if (!ok) throw noEncontrado();
  return visibles;
}

// Existencia sumada solo en estos almacenes. Para un modelo, la de sus variantes. Reemplaza al
// `products.stock`, que es el total de la empresa e incluye lo de las otras tiendas.
async function existenciaEn(productIds, visibles) {
  const ids = productIds.map(n => parseInt(n, 10)).filter(Number.isInteger);
  if (!ids.length) return new Map();
  const almacenes = listaIds(visibles);
  // Dos sumas: la ficha propia de cada id, y la de las variantes de los que son modelo. Un
  // modelo no tiene ficha, así que nada se cuenta dos veces.
  const filas = await sequelize.query(`
    SELECT ps.product_id AS id, SUM(ps.qty)::float AS qty
      FROM product_stock ps
     WHERE ps.product_id IN (:ids) AND ps.warehouse_id IN (${almacenes})
     GROUP BY ps.product_id
    UNION ALL
    SELECT v.parent_id AS id, SUM(ps.qty)::float AS qty
      FROM products v
      JOIN product_stock ps ON ps.product_id = v.id AND ps.warehouse_id IN (${almacenes})
     WHERE v.parent_id IN (:ids)
     GROUP BY v.parent_id
  `, { replacements: { ids }, type: Sequelize.QueryTypes.SELECT });
  const total = new Map();
  for (const f of filas) total.set(f.id, (total.get(f.id) || 0) + f.qty);
  return total;
}

// Las líneas de un documento que mete productos en la sucursal (una compra). Fuera del admin,
// cada producto tiene que ser de sus almacenes, o venir con su código de barras exacto: es como
// se trae uno que solo maneja otra sucursal. `yaEnDocumento`: los productos que el documento
// ya tenía guardados, que se autorizaron cuando se agregaron.
async function assertLineasAccess(req, items, yaEnDocumento = []) {
  const visibles = await visibleWarehouseIds(req);
  if (!visibles || !Array.isArray(items) || !items.length) return;
  const pedidos = [...new Set(items.map(i => parseInt(i.product_id, 10)).filter(Number.isInteger))];
  const propios = new Set([...(await idsVisibles(pedidos, visibles)), ...yaEnDocumento.map(Number)]);
  const ajenos = pedidos.filter(id => !propios.has(id));
  if (!ajenos.length) return;
  const { Product } = require("../../models");
  const codigos = await Product.findAll({ where: { id: ajenos }, attributes: ["id", "barcode"], raw: true });
  const codigoDe = new Map(codigos.map(p => [p.id, String(p.barcode || "").trim()]));
  for (const id of ajenos) {
    const linea = items.find(i => parseInt(i.product_id, 10) === id);
    const traido = String(linea?.barcode || "").trim();
    if (!traido || traido !== codigoDe.get(id)) throw noEncontrado();
  }
}

module.exports = { condicionSucursal, idsVisibles, assertProductAccess, assertLineasAccess, existenciaEn, noEncontrado };
