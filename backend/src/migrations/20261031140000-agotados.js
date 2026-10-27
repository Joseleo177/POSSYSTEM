'use strict';

// "Agotado" manual de una opción de adicionales. Lo que tiene inventario se agota solo (la
// existencia del producto, o la de los ingredientes si es combo); una opción de texto —"Tostones"
// como contorno— no tiene de dónde saberlo, y la cocina es la primera en enterarse de que se
// acabó el plátano. Se marca a mano desde la cocina o desde Catálogo → Adicionales.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE modifier_options ADD COLUMN IF NOT EXISTS sold_out BOOLEAN NOT NULL DEFAULT false`
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE modifier_options DROP COLUMN IF EXISTS sold_out`);
  },
};
