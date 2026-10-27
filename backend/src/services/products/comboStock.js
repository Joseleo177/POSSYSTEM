const { ProductComboItem, Product } = require("../../models");

// Componentes de un combo que mueven existencias.
//
// Un servicio dentro de un combo ("corte de pelo + refresco": el corte es servicio, el refresco
// no) se cobra con el combo y suma su costo, pero no tiene existencia que descontar ni que
// devolver. Tratarlo como producto rechazaba la venta ("Disponible: 0") y, al anular o devolver,
// le abría al servicio una ficha con existencia.
async function componentesConStock(comboId, transaction) {
  const items = await ProductComboItem.findAll({
    where: { combo_id: comboId },
    include: [{ model: Product, as: "ingredient", attributes: ["id", "is_service"] }],
    transaction,
  });
  return items.filter(i => i.ingredient && !i.ingredient.is_service);
}

module.exports = { componentesConStock };
