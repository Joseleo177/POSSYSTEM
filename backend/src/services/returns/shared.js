const { Return, Sequelize } = require("../../models");

const Op = Sequelize.Op;

/**
 * Filtro para que los conteos de mercancía devuelta ignoren las notas de crédito anuladas.
 *
 * Anular una NC significa que esa devolución nunca ocurrió: sus líneas no pueden seguir
 * contando como "ya devuelto", porque entonces esas unidades quedarían bloqueadas para
 * siempre —no se podrían devolver de verdad— y la factura seguiría figurando como devuelta.
 *
 * Devuelve un fragmento de `where` para ReturnItem, vacío cuando no hay ninguna anulada
 * (el caso normal), para no ensuciar la consulta con un NOT IN inútil.
 */
async function excludeAnnulledReturns(saleId, transaction) {
  const anuladas = await Return.findAll({
    where: { sale_id: saleId, status: "anulado" },
    attributes: ["id"],
    transaction,
  });
  return anuladas.length ? { return_id: { [Op.notIn]: anuladas.map((r) => r.id) } } : {};
}

module.exports = { excludeAnnulledReturns };
