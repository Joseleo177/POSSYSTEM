'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Normalizar GRAMO a KG (División por 1000)
    await queryInterface.sequelize.query(`
      UPDATE "Products" 
      SET 
        unit = 'KG', 
        stock = stock / 1000, 
        price = price * 1000 
      WHERE unit IN ('gramo', 'GRAMO', 'gr', 'g');
    `);

    // 2. Normalizar ML a LITRO (División por 1000)
    await queryInterface.sequelize.query(`
      UPDATE "Products" 
      SET 
        unit = 'LITRO', 
        stock = stock / 1000, 
        price = price * 1000 
      WHERE unit IN ('ml', 'ML', 'mililitro', 'mililitros');
    `);

    // 3. Normalizar CM a METRO (División por 100)
    await queryInterface.sequelize.query(`
      UPDATE "Products" 
      SET 
        unit = 'METRO', 
        stock = stock / 100, 
        price = price * 100 
      WHERE unit IN ('cm', 'CM', 'centimetro', 'centimetros');
    `);

    // 4. Estandarizar UNIDAD
    await queryInterface.sequelize.query(`
      UPDATE "Products" SET unit = 'UNIDAD' WHERE unit IN ('unidad', 'pieza', 'uds', 'UDS', 'Uds');
    `);

    console.log('✅ Normalización de unidades completada.');
  },

  async down(queryInterface, Sequelize) {
    // Esta migración no es reversible de forma automática (pérdida de precisión o ambiguo)
  }
};
