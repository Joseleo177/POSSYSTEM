'use strict';

// La ficha pública del producto (/catalogo/<tienda>/p/<id>) necesita un texto largo de venta:
// lo que el vendedor diría del producto si tuviera al cliente enfrente. Es TEXT y no STRING
// porque es prosa en párrafos y no tiene un largo natural que imponer desde el esquema; el
// límite razonable se aplica al publicar, no al guardar.
//
// Los beneficios ("Repara y fortalece", "Reduce el frizz") NO van aquí como texto libre: son
// una lista reusable, ver la migración de catalog-benefit-tags.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('products', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('products', 'description');
  }
};
