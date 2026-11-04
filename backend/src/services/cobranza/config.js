/**
 * Configuración de la cobranza, en `settings`: listas de ids como JSON.
 *  - cobranza_product_ids: lo que el cobrador puede dejar a crédito (la bolsa, y lo que venga).
 *  - cobranza_regalos_category_ids: las categorías de las que salen los regalos.
 */
const { Setting } = require("../../models");

const PRODUCTS_KEY = "cobranza_product_ids";
const GIFT_CATEGORIES_KEY = "cobranza_regalos_category_ids";

async function leerLista(key, companyId) {
  const row = await Setting.findOne({ where: { key, company_id: companyId }, attributes: ["value"] });
  try {
    const v = JSON.parse(row?.value || "[]");
    return Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

const guardarLista = (key, companyId, ids) =>
  Setting.upsert({ key, company_id: companyId, value: JSON.stringify([...new Set(ids)]) });

module.exports = { PRODUCTS_KEY, GIFT_CATEGORIES_KEY, leerLista, guardarLista };
