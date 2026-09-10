'use strict';

// "Modo recepción": cargar la factura del proveedor mientras la mercancía ya está entrando.
//
// El caso real: el producto está en cero en el estante, llegó el camión y no hay tiempo de
// teclear la factura completa antes de poder vender. Con el modo prendido, cada línea que se
// guarda entra al stock en el acto, y la orden queda abierta ('parcial') para seguir
// cargándola. Apagado, el módulo se comporta como siempre: se arma la orden entera y se
// recibe de una vez.
//
//   purchases.receiving_mode   — el interruptor, guardado en la orden para que sobreviva a
//                                recargar la página o a que la retome otra persona.
//   purchase_items.received_units — cuántas unidades de esa línea YA entraron al inventario.
//                                Es acumulativo: si el proveedor manda la mercancía en dos
//                                viajes, se sube la cantidad y solo entra la diferencia.
//                                Es también lo que se devuelve al anular la orden — antes se
//                                devolvía `total_units`, que en una orden a medio recibir
//                                habría descontado stock que nunca entró.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('purchases', 'receiving_mode', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('purchase_items', 'received_units', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0,
    });
    // Las órdenes ya recibidas entraron completas: su recibido es su cantidad. Sin esto,
    // anular una compra vieja no devolvería nada al inventario.
    await queryInterface.sequelize.query(`
      UPDATE purchase_items pi
         SET received_units = pi.total_units
        FROM purchases p
       WHERE p.id = pi.purchase_id
         AND p.status = 'recibido'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('purchase_items', 'received_units');
    await queryInterface.removeColumn('purchases', 'receiving_mode');
  }
};
