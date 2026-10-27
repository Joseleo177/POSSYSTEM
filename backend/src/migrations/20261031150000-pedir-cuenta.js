'use strict';

// "Pidió la cuenta": el mesonero lo marca desde la mesa y la caja lo ve en el mapa, con la hora,
// sin que nadie tenga que ir a avisar. Se apaga solo al cobrar (la cuenta deja de estar abierta).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ NULL`
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE sales DROP COLUMN IF EXISTS bill_requested_at`);
  },
};
