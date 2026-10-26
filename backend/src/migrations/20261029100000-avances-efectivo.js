'use strict';

/**
 * Avances de efectivo.
 *
 * El cliente pide efectivo en caja y lo paga por el punto (o pago móvil) con una comisión
 * encima: entrega Bs.1000 en billetes y se le pasan Bs.1100 por el punto. Es dinero que solo
 * cruza la caja más la comisión, que sí es ganancia (decisiones del usuario, 26-10-2026: la
 * comisión va encima y se registra como ingreso, sin factura; puede hacerse sola o junto a una
 * venta, en el mismo pase del punto).
 *
 * Se asienta con lo que ya cuadra el arqueo: un EGRESO de la caja de efectivo por lo entregado y
 * dos INGRESOS en la cuenta que recibe (el avance y la comisión). `cash_advances` los ata —con
 * `cash_advance_id` en cada uno— para anularlos juntos y para que el reporte de finanzas no
 * cuente como ingreso y egreso lo que solo pasó por la caja.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cash_advances', {
      id:              { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      company_id:      { type: Sequelize.INTEGER, allowNull: true },
      warehouse_id:    { type: Sequelize.INTEGER, allowNull: true },
      employee_id:     { type: Sequelize.INTEGER, allowNull: true },
      customer_id:     { type: Sequelize.INTEGER, allowNull: true },
      // La venta con la que se cobró en el mismo pase del punto, si la hubo.
      sale_id:         { type: Sequelize.INTEGER, allowNull: true },
      // Lo entregado, en la moneda de la caja de efectivo, y su equivalente en base.
      cash_amount:     { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      cash_journal_id: { type: Sequelize.INTEGER, allowNull: false },
      fee_pct:         { type: Sequelize.DECIMAL(7, 3), allowNull: false, defaultValue: 0 },
      // Lo cobrado por la cuenta que recibe (avance + comisión), en su moneda.
      in_amount:       { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fee_amount:      { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      in_journal_id:   { type: Sequelize.INTEGER, allowNull: false },
      in_method:       { type: Sequelize.STRING(30), allowNull: true },
      reference:       { type: Sequelize.STRING(50), allowNull: true },
      status:          { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'activo' },
      created_at:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('cash_advances', ['company_id', 'created_at']);
    await queryInterface.addColumn('incomes', 'cash_advance_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('expenses', 'cash_advance_id', { type: Sequelize.INTEGER, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('expenses', 'cash_advance_id');
    await queryInterface.removeColumn('incomes', 'cash_advance_id');
    await queryInterface.dropTable('cash_advances');
  },
};
