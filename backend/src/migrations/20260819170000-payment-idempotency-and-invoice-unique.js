'use strict';

// Dos cerrojos de concurrencia sobre el cobro.
//
// 1) payments.idempotency_key
//    Cobrar una venta completa ya estaba protegido: createPayment bloquea la venta y
//    rechaza si el estado es 'pagado'. Pero un ABONO PARCIAL no tiene ese guardia —la
//    venta sigue en 'pendiente'/'parcial'— así que un reintento tras un corte de red
//    (o un doble toque en la tablet) registraba el mismo abono dos veces, descuadrando
//    la caja y el saldo del cliente. La clave la genera la caja una sola vez por cobro
//    y se reutiliza en los reintentos: el índice único convierte el duplicado en un
//    "ya está registrado" en vez de un segundo pago.
//
// 2) sales (company_id, invoice_number) único
//    El correlativo ya se asigna bloqueando el rango de la serie, y con eso basta para
//    el flujo normal. Este índice es la red debajo: deja que la base rechace un número
//    repetido venga de donde venga (un script, una carga manual, un endpoint futuro).
//    Va por empresa, no global: cada empresa lleva sus propias series y el prefijo
//    A-0001 de una no tiene nada que ver con el de otra.
//
// Ambos índices ignoran los NULL, así que las ventas sin número y los pagos antiguos
// (sin clave) conviven sin estorbar.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'idempotency_key', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addIndex('payments', ['idempotency_key'], {
      name: 'payments_idempotency_key_key',
      unique: true,
    });

    // Si esta migración fallara aquí, es que ya existen correlativos repetidos: hay que
    // resolverlos a mano antes de reintentar (la consulta está en el comentario de abajo).
    //   SELECT company_id, invoice_number, count(*) FROM sales
    //   WHERE invoice_number IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
    await queryInterface.addIndex('sales', ['company_id', 'invoice_number'], {
      name: 'sales_company_invoice_number_key',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('sales', 'sales_company_invoice_number_key');
    await queryInterface.removeIndex('payments', 'payments_idempotency_key_key');
    await queryInterface.removeColumn('payments', 'idempotency_key');
  },
};