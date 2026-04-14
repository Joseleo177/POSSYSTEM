'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Agregar payment_status a purchases
    await queryInterface.addColumn('purchases', 'payment_status', {
      type: Sequelize.STRING(20),
      defaultValue: 'pendiente', // pendiente | parcial | pagado
      allowNull: false,
    });

    // 2. Crear tabla purchase_payments
    await queryInterface.createTable('purchase_payments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      purchase_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'purchases', key: 'id' },
        onDelete: 'CASCADE',
      },
      amount:             { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency_id:        { type: Sequelize.INTEGER, allowNull: true, references: { model: 'currencies', key: 'id' } },
      exchange_rate:      { type: Sequelize.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
      payment_journal_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'payment_journals', key: 'id' } },
      employee_id:        { type: Sequelize.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' } },
      reference_date:     { type: Sequelize.DATEONLY, allowNull: true },
      reference_number:   { type: Sequelize.STRING(100), allowNull: true },
      notes:              { type: Sequelize.TEXT, allowNull: true },
      created_at:         { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('purchase_payments');
    await queryInterface.removeColumn('purchases', 'payment_status');
  },
};
