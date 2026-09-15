'use strict';

// Precisión del descuento de cabecera.
//
// `sales.discount_amount` seguía en DECIMAL(10,2) mientras el resto de los montos de la venta ya
// estaba en cinco decimales: `sales.total` (14,5), `sales.service_charge` (14,5) y
// `sale_items.discount` (14,5). El descuento se guarda en moneda BASE, así que un monto tecleado
// en bolívares nunca cae redondo: el cajero escribe 1.420,00 Bs, a 845 Bs/$ eso son
// 1,68047337 $, Postgres lo recortaba a 1,68 y al volver a bolívares quedaba en 1.419,60. El
// carrito mostraba el total con el descuento entero (Bs.29.000,00) y la factura salía con
// Bs.29.000,40: cuarenta céntimos que el cliente veía aparecer al cerrar.
//
// Con cinco decimales, 1,68047 × 845 = 1.419,997 → redondeado al mostrarlo: 1.420,00 exacto.
//
// `quotations.discount_amount` sube igual, por lo mismo: la cotización se arma en la misma
// pantalla y con la misma moneda, y su total tiene que poder repetirse al facturarla.
//
// No hay backfill: lo ya guardado se escribió recortado y no se puede recuperar el monto
// original —solo se sabría con la tasa y el valor tecleado, que no se guardan—. Las facturas
// viejas se quedan como están; a partir de aquí el descuento entra completo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('sales', 'discount_amount', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('quotations', 'discount_amount', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface, Sequelize) {
    // Volver a dos decimales recorta los descuentos que hayan usado la precisión nueva: es
    // pérdida real de información. Se deja para poder revertir el tipo, no los datos.
    await queryInterface.changeColumn('quotations', 'discount_amount', {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('sales', 'discount_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },
};
