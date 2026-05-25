'use strict';

// En Venezuela el dólar no es de curso legal: los precios referenciados
// deben mostrarse como "Ref." y no con el signo "$".
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE currencies SET symbol = 'Ref.' WHERE is_base = true AND symbol = '$'`
    );
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE currencies SET symbol = '$' WHERE is_base = true AND symbol = 'Ref.'`
    );
  },
};
