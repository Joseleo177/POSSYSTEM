'use strict';

/**
 * Subcategorías de productos (18-11-2026):
 * - categories.subcategories: lista opcional de subcategorías sugeridas dentro de la categoría
 *   (ej. Categoría "Almuerzos" → ["Parrilla", "Asados", "Cocina"]).
 * - products.subcategory: subcategoría asignada al plato/producto (ej. "Parrilla"), para filtrar
 *   en el catálogo y consultar en reportes cuántos platos salieron por cada área/subcategoría
 *   (por ejemplo, para pagarle al parrillero por plato vendido).
 */
const SQL_UP = `
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS subcategories JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
`;

const SQL_DOWN = `
  ALTER TABLE products DROP COLUMN IF EXISTS subcategory;
  ALTER TABLE categories DROP COLUMN IF EXISTS subcategories;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
