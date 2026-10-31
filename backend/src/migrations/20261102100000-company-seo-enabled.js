'use strict';

// "Aparecer en Google": la vitrina entra al sitemap y su cabecera no lleva noindex. Encendido
// para todas, incluidas las que ya existen: el catálogo ya es público, esto solo ayuda a que
// Google lo encuentre. El superusuario lo apaga en Gestión de Empresas a quien no lo quiera.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS seo_enabled BOOLEAN NOT NULL DEFAULT true`
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('companies', 'seo_enabled');
  }
};
