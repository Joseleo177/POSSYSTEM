'use strict';

// `customers.credit_balance` era un acumulador ciego: sumaba y restaba sin dejar rastro de
// qué sucursal generó cada monto. Una devolución en la Sucursal A dejaba crédito que se
// aplicaba igual en la B, aunque esa caja nunca vio ese dinero ni puede explicarlo en su
// arqueo. Esta tabla es el ledger que faltaba: cada movimiento (positivo al generarse,
// negativo al consumirse o devolverse en efectivo) queda con SU sucursal.
//
// `warehouse_id` NULL es "compartido" —mismo criterio que ya usan payment_journals y series—:
// ahí es donde cae TODO el crédito que ya existía antes de este ledger (se migra como un solo
// movimiento por cliente, ver `up`), porque nunca se supo de qué sucursal salió. Ese crédito
// viejo sigue pudiéndose usar en cualquier sucursal, igual que antes; el crédito NUEVO que se
// genere de ahora en más sí queda atado a la sucursal donde se generó.
//
// `credit_balance` no se elimina: sigue siendo el total en caché para no tener que sumar el
// ledger completo cada vez que se muestra "crédito disponible" en una pantalla que mira la
// empresa entera. Lo que cambia es que aplicar o devolver crédito en una venta ahora se topa
// contra lo disponible EN ESA SUCURSAL (compartido + lo propio), no contra el total global.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customer_credit_movements', {
      id:            { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id:   {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'customers', key: 'id' }, onDelete: 'CASCADE',
      },
      warehouse_id:  {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'warehouses', key: 'id' }, onDelete: 'SET NULL',
      },
      // Positivo = crédito generado (devolución, sobrante de un cobro). Negativo = crédito
      // consumido (aplicado a una factura) o devuelto en efectivo.
      amount:        { type: Sequelize.DECIMAL(14, 6), allowNull: false },
      reason:        { type: Sequelize.STRING(30), allowNull: false },
      sale_id:       {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'sales', key: 'id' }, onDelete: 'SET NULL',
      },
      return_id:     {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'returns', key: 'id' }, onDelete: 'SET NULL',
      },
      employee_id:   {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'employees', key: 'id' }, onDelete: 'SET NULL',
      },
      company_id:    { type: Sequelize.INTEGER, allowNull: true },
      created_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('customer_credit_movements', ['customer_id'], {
      name: 'customer_credit_movements_customer_id_idx',
    });
    await queryInterface.addIndex('customer_credit_movements', ['customer_id', 'warehouse_id'], {
      name: 'customer_credit_movements_customer_warehouse_idx',
    });

    // Migra el saldo que ya existía como un único movimiento "compartido" por cliente, para
    // no perder ni un centavo de lo que la gente ya tenía a favor.
    await queryInterface.sequelize.query(`
      INSERT INTO customer_credit_movements (customer_id, warehouse_id, amount, reason, company_id, created_at)
      SELECT id, NULL, credit_balance, 'saldo_inicial', company_id, NOW()
        FROM customers
       WHERE credit_balance IS NOT NULL AND credit_balance <> 0;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_credit_movements');
  },
};
