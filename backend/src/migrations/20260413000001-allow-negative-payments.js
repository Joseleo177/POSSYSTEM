'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Eliminar la restricción de que amount > 0 para permitir reembolsos (pagos negativos)
    // Primero buscamos el nombre de la restricción si existe
    await queryInterface.sequelize.query('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check');
    
    console.log('--- Migración: Permitidos montos negativos en payments (reembolsos) ---');
  },

  down: async (queryInterface, Sequelize) => {
    // Volvieron a restringirlo si es necesario, pero usualmente esto no se deshace así de fácil si ya hay negativos
    await queryInterface.sequelize.query('ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0)');
  }
};
