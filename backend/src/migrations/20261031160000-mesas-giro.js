'use strict';

// Giro de las mesas en el plano: 0, 45, 90 o 135 grados. w y h siguen siendo la huella en la
// cuadrícula (la caja que ocupa la mesa ya girada, con sus sillas), así que el plano, los
// choques y la validación de bordes no cambian.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS rotation SMALLINT NOT NULL DEFAULT 0`
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE dining_tables DROP COLUMN IF EXISTS rotation`);
  },
};
