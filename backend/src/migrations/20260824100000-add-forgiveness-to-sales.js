'use strict';

// Exoneración de saldo: perdonar lo que falta por cobrar de una factura.
//
// Hasta ahora una factura solo podía cerrarse con dinero (createPayment exige un monto contra
// un diario) o con una nota de crédito, que reingresa la mercancía al almacén y le acredita el
// monto al cliente. Ninguna de las dos sirve para el caso real: al empleado que se llevó la
// mercancía se le perdona la deuda —el inventario ya salió y no hay nada que acreditarle—, o
// el cliente quedó debiendo veinte céntimos y se decide dejarlo así.
//
// Se guarda en la propia venta y NO como un Payment: un cobro que nunca entró a caja
// descuadraría el arqueo, el dashboard de cobranza y los reportes por diario, que suman sobre
// la tabla `payments`. Con esto, el dinero de la tabla payments sigue siendo dinero real.
//
// `forgiven_amount` va en moneda BASE (USD), igual que el total de la venta.
//
// La factura exonerada queda en status 'exonerado': sale de cuentas por cobrar sin hacerse
// pasar por cobrada. Los reportes de ventas la siguen contando (la mercancía salió y el
// documento fiscal se emitió); el arqueo de caja no.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'forgiven_amount', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('sales', 'forgiven_reason', {
      type: Sequelize.STRING(300),
      allowNull: true,
    });
    await queryInterface.addColumn('sales', 'forgiven_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('sales', 'forgiven_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    // Las que estén exoneradas vuelven a deberse: sin las columnas no hay dónde leer el
    // perdón, y dejarlas en 'exonerado' las escondería de cuentas por cobrar para siempre.
    await queryInterface.sequelize.query(
      `UPDATE sales SET status = CASE
         WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE sale_id = sales.id) > 0 THEN 'parcial'
         ELSE 'pendiente' END
       WHERE status = 'exonerado'`
    );
    await queryInterface.removeColumn('sales', 'forgiven_amount');
    await queryInterface.removeColumn('sales', 'forgiven_reason');
    await queryInterface.removeColumn('sales', 'forgiven_by');
    await queryInterface.removeColumn('sales', 'forgiven_at');
  },
};
