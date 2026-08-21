'use strict';

// Recargo de la venta: propina, servicio, delivery.
//
// Hasta ahora el total solo podía bajar (descuento global y promociones) pero nunca subir. En
// un restaurante hace falta lo contrario: sumar el 10% de servicio o la propina que deja el
// cliente, discriminada en el papel y separada de la mercancía.
//
// Va como campo de cabecera y no como una línea más del carrito a propósito: una propina no
// es un producto, no descuenta inventario y no debe aparecer en el reporte de lo vendido ni
// falsear los márgenes con un costo cero.
//
// El monto se guarda en moneda BASE (USD), igual que discount_amount: la caja lo escribe en
// la moneda que tenga en pantalla y el frontend lo convierte antes de enviarlo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'service_charge', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('sales', 'service_charge_label', {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'service_charge');
    await queryInterface.removeColumn('sales', 'service_charge_label');
  },
};