'use strict';

/**
 * Ventas con Cashea.
 *
 * El cliente paga una inicial en la tienda (el % según su nivel en Cashea) y Cashea financia el
 * resto: se lo paga a la tienda días después, con su comisión descontada. Para la tienda la venta
 * queda cobrada; lo financiado no es deuda del cliente sino de Cashea (decisiones del usuario,
 * 02-11-2026: el cajero escribe la inicial que le da Cashea).
 *
 * Lo financiado entra como un cobro más contra el diario "Cashea" (type 'cashea', se crea solo),
 * así que el saldo de ese diario es lo que Cashea debe. Cuando deposita, la liquidación
 * (`cashea_settlements`) marca esos cobros, pasa el dinero del diario Cashea al banco (egreso +
 * ingreso) y lo que no llegó queda como egreso "Comisión Cashea". Los tres movimientos llevan
 * `cashea_settlement_id`: se anulan juntos y el reporte de finanzas trata el traspaso como el
 * avance de efectivo, sin contarlo como ingreso y egreso.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cashea_settlements', {
      id:                { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      company_id:        { type: Sequelize.INTEGER, allowNull: true },
      // Cuenta en la que depositó Cashea y por qué método entró.
      journal_id:        { type: Sequelize.INTEGER, allowNull: false },
      payment_method:    { type: Sequelize.STRING(30), allowNull: true },
      cashea_journal_id: { type: Sequelize.INTEGER, allowNull: false },
      sale_count:        { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Lo que Cashea debía por esas ventas, en moneda base.
      owed_amount:       { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      // Lo que llegó, en la moneda de la cuenta, con su tasa; y su equivalente en base.
      received_amount:   { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      rate:              { type: Sequelize.DECIMAL(14, 6), allowNull: false, defaultValue: 1 },
      received_base:     { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      // Lo que se quedó Cashea: lo debido menos lo que llegó, en base.
      commission:        { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      date:              { type: Sequelize.DATEONLY, allowNull: false },
      reference:         { type: Sequelize.STRING(50), allowNull: true },
      notes:             { type: Sequelize.TEXT, allowNull: true },
      employee_id:       { type: Sequelize.INTEGER, allowNull: true },
      status:            { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'activo' },
      created_at:        { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('cashea_settlements', ['company_id', 'date']);
    await queryInterface.addColumn('payments', 'cashea_settlement_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('incomes', 'cashea_settlement_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('expenses', 'cashea_settlement_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addIndex('payments', ['cashea_settlement_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', ['cashea_settlement_id']);
    await queryInterface.removeColumn('expenses', 'cashea_settlement_id');
    await queryInterface.removeColumn('incomes', 'cashea_settlement_id');
    await queryInterface.removeColumn('payments', 'cashea_settlement_id');
    await queryInterface.dropTable('cashea_settlements');
  },
};
