'use strict';

// Un pedido del catálogo público nace con `warehouse_id` NULL: nadie del comercio lo ha
// aceptado todavía, y quien lo acepte es quien de verdad decide de qué almacén sale la
// mercancía. Pero el cliente SÍ eligió una tienda al armar el pedido —los precios, las
// promociones y la existencia que vio en la vitrina son los de esa tienda concreta
// (createOrder en publicCatalogService.js ya la valida y la usa para todo eso)— y esa
// elección se estaba descartando sin guardarla en ningún lado.
//
// Sin esta columna, dos sucursales sin nada que ver entre sí tenían que ver TODOS los
// pedidos web de la empresa, sin poder saber cuál era para cada una hasta abrirlo. Esta
// columna guarda esa intención original, separada de `warehouse_id` (que sigue siendo la
// sucursal que de verdad despachó el pedido, y solo se llena al aceptarlo).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'requested_warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('sales', ['requested_warehouse_id'], {
      name: 'sales_requested_warehouse_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('sales', 'sales_requested_warehouse_id_idx');
    await queryInterface.removeColumn('sales', 'requested_warehouse_id');
  },
};
