'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payments', 'change_given', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: true,
      defaultValue: null,
      comment: 'Cambio/vuelto entregado al cliente (en moneda base)',
    });
    await queryInterface.addColumn('payments', 'change_journal_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: { model: 'payment_journals', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Diario del que se descontó el cambio entregado',
    });
    console.log('--- Migración: change_given y change_journal_id añadidos a payments ---');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('payments', 'change_given');
    await queryInterface.removeColumn('payments', 'change_journal_id');
  },
};
