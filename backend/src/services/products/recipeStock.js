const { sequelize, Sequelize, ProductStock, RecipeSheet } = require("../../models");
const { componentesConStock } = require("./comboStock");

// Lo que comparten los caminos que venden un combo o un plato con receta (createSale,
// updateSale, la cotización, el pedido web, el cambio) y los que lo revierten (anular, editar
// la cuenta, la NC, anular la NC). Ver la migración 20261101100000-recetas.

const SIN_INSUMO_KEY = "recetas_vender_sin_insumo";

/**
 * ¿Se vende el plato aunque el sistema diga que no alcanza un ingrediente? En una cocina el
 * conteo nunca cuadra al gramo, y bloquear la venta por eso para el servicio. El ingrediente
 * queda en negativo y el descuadre se ve en el inventario.
 *
 * Sin la clave guardada vale lo que diga el interruptor de restaurante (cocina_enabled): así
 * los combos de las demás empresas siguen bloqueando como siempre. Una sola consulta: corre
 * dentro de la transacción de la venta, y en Supabase el pool es chico.
 */
async function vendeSinInsumo(warehouseId, transaction) {
  if (!warehouseId) return false;
  const [fila] = await sequelize.query(`
    SELECT c.cocina_enabled, s.value
      FROM warehouses w
      JOIN companies c ON c.id = w.company_id
      LEFT JOIN settings s ON s.company_id = c.id AND s.key = :key
     WHERE w.id = :wid`,
    { replacements: { wid: warehouseId, key: SIN_INSUMO_KEY }, type: Sequelize.QueryTypes.SELECT, transaction });
  if (!fila) return false;
  if (fila.value === "true") return true;
  if (fila.value === "false") return false;
  return !!fila.cocina_enabled;
}

/** Igual que vendeSinInsumo, por empresa (la vitrina pública no siempre tiene sucursal). */
async function vendeSinInsumoEmpresa(companyId, transaction) {
  if (!companyId) return false;
  const [fila] = await sequelize.query(`
    SELECT c.cocina_enabled, s.value
      FROM companies c
      LEFT JOIN settings s ON s.company_id = c.id AND s.key = :key
     WHERE c.id = :cid`,
    { replacements: { cid: companyId, key: SIN_INSUMO_KEY }, type: Sequelize.QueryTypes.SELECT, transaction });
  if (!fila) return false;
  if (fila.value === "true") return true;
  if (fila.value === "false") return false;
  return !!fila.cocina_enabled;
}

/**
 * La ficha del ingrediente en la sucursal, creada en cero si no existe, para poder dejarla en
 * negativo. Mismo criterio que la venta sin conexión.
 */
async function fichaEnCero(warehouseId, productId, transaction) {
  await ProductStock.findOrCreate({
    where: { warehouse_id: warehouseId, product_id: productId },
    defaults: { warehouse_id: warehouseId, product_id: productId, qty: 0 },
    transaction,
  });
  return ProductStock.findOne({ where: { warehouse_id: warehouseId, product_id: productId }, transaction, lock: true });
}

/**
 * La foto de lo que descuenta UNA unidad de la línea, a partir de lo que el camino de venta ya
 * armó: [{ ingredient, qtyNeeded, servicio? }] para `lineQty` unidades. Los servicios no
 * mueven existencias y no van. 5 decimales: 0,313 KG × 3 platos ÷ 3 tiene que volver exacto.
 */
function fotoConsumo(ingredientsData, lineQty) {
  const qty = parseFloat(lineQty);
  if (!(qty > 0)) return [];
  return ingredientsData
    .filter(i => !i.servicio && !i.ingredient?.is_service)
    .map(i => ({
      product_id: i.ingredient.id,
      quantity: Math.round((parseFloat(i.qtyNeeded) / qty) * 100000) / 100000,
    }));
}

/**
 * Lo que repone UNA unidad de una línea vendida: [{ product_id, quantity }].
 *   - Con foto, la foto: es lo que salió de verdad, aunque la receta haya cambiado después.
 *   - Sin foto (líneas de antes), la receta actual del combo, como hasta ahora; salvo que el
 *     plato haya empezado a descontar su receta DESPUÉS de esa venta (era servicio): entonces
 *     nada, porque esa venta nunca descontó.
 * null = la línea no es de combo: el llamador sigue con su lógica de producto normal o servicio.
 */
async function consumoDeLinea(item, product, fechaVenta, transaction) {
  if (Array.isArray(item?.components)) {
    return item.components.map(c => ({ product_id: parseInt(c.product_id, 10), quantity: parseFloat(c.quantity) || 0 }));
  }
  if (!product?.is_combo) return null;
  const ficha = await RecipeSheet.findOne({ where: { product_id: product.id }, attributes: ["combo_since"], transaction });
  if (ficha?.combo_since && fechaVenta && new Date(fechaVenta) < new Date(ficha.combo_since)) return [];
  const items = await componentesConStock(product.id, transaction);
  return items.map(c => ({ product_id: c.product_id, quantity: parseFloat(c.quantity) }));
}

/**
 * El producto empieza AHORA a descontar su receta (era servicio o producto normal). Se anota
 * en su ficha para que anular o devolver una venta de antes no reponga lo que nunca salió.
 * company_id va explícito: el Catálogo guarda por multer y ahí se pierde el tenant.
 */
async function marcarRecetaDesde(productId, companyId, transaction) {
  const ficha = await RecipeSheet.findOne({ where: { product_id: productId }, transaction });
  if (ficha) return ficha.update({ combo_since: new Date() }, { transaction });
  return RecipeSheet.create({ product_id: productId, company_id: companyId, combo_since: new Date() }, { transaction });
}

module.exports = { SIN_INSUMO_KEY, vendeSinInsumo, vendeSinInsumoEmpresa, fichaEnCero, fotoConsumo, consumoDeLinea, marcarRecetaDesde };
