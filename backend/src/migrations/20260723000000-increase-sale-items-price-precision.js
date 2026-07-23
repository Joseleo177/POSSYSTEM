'use strict';

// El precio del producto se guarda con 5 decimales (costo × margen), pero sale_items.price y
// sales.total estaban limitados a DECIMAL(10,2): esa precisión extra se truncaba para siempre al
// grabar la venta, y el Bs mostrado en catálogo (precisión completa) nunca coincidía exactamente
// con el Bs de la factura real (redondeada a 2 decimales en $ antes de convertir).
//
// sale_items.subtotal es GENERATED ALWAYS AS ((price - discount) * quantity) STORED — Postgres no
// permite ampliar price/discount mientras una columna generada dependa de ellas, así que hay que
// eliminarla, ampliar las columnas base, y recrearla con la nueva precisión.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TABLE sale_items DROP COLUMN subtotal;`);

    await queryInterface.changeColumn('sale_items', 'price', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
    await queryInterface.changeColumn('sale_items', 'discount', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE sale_items
      ADD COLUMN subtotal NUMERIC(14, 5) GENERATED ALWAYS AS ((price - discount) * quantity) STORED;
    `);

    await queryInterface.changeColumn('sales', 'total', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TABLE sale_items DROP COLUMN subtotal;`);

    await queryInterface.changeColumn('sale_items', 'price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('sale_items', 'discount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE sale_items
      ADD COLUMN subtotal NUMERIC(10, 2) GENERATED ALWAYS AS ((price - discount) * quantity) STORED;
    `);

    await queryInterface.changeColumn('sales', 'total', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
  },
};
