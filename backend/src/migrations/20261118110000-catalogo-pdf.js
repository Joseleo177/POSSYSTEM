'use strict';

/**
 * Catálogo PDF al mayor como extra por empresa (11-11-2026).
 *
 * Lo enciende el superusuario en Empresas, igual que la vitrina o la cocina. Sin él no aparece
 * el botón "Catálogo PDF", ni el precio al mayor en la ficha, ni la columna en la plantilla, y
 * GET /products/catalog-pdf responde 403.
 */
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS catalogo_pdf_enabled BOOLEAN NOT NULL DEFAULT false;
`;
const SQL_DOWN = `
  ALTER TABLE companies DROP COLUMN IF EXISTS catalogo_pdf_enabled;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
