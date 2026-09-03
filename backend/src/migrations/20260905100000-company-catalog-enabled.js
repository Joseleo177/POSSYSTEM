'use strict';

// El catálogo público no viene incluido para todas las empresas: es un extra que solo el
// superusuario enciende, empresa por empresa, desde Gestión de Empresas — no algo que cada
// negocio pueda activarse a sí mismo desde sus propios ajustes.
//
// Nace en false para toda empresa nueva. Las que YA estaban usando el catálogo (tienen su
// enlace configurado) se migran encendidas: esta migración habilita el control de acceso,
// no debe apagarle a nadie algo que ya tenía funcionando.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('companies', 'catalog_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE companies SET catalog_enabled = true
      WHERE id IN (
        SELECT DISTINCT company_id FROM settings
        WHERE key = 'public_catalog_slug' AND company_id IS NOT NULL
      )
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('companies', 'catalog_enabled');
  }
};
