'use strict';

// Margen de ganancia propio de la sucursal, cuarto miembro de la ficha `product_stock` junto
// a price, cost_price y min_stock.
//
// Faltaba, y por eso editar un producto parado en una sucursal descartaba el margen que el
// usuario tecleaba: el precio y el costo se guardaban en la ficha, pero el margen se dejaba
// intacto en el producto (es el del precio general) y al releer se despejaba de nuevo desde
// el precio ya redondeado a dos decimales. Escribir 5% sobre un costo de 2,2417 da 2,353785
// → 2,35, y despejar desde 2,35 devuelve 4,83%: el usuario veía que el sistema le había
// cambiado el margen a sus espaldas.
//
// NULL —no 0— significa "hereda del producto", igual que los otros tres campos: un 0 sería
// un margen de cero, que es un valor legítimo y distinto de "sin definir".
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('product_stock', 'profit_margin', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('product_stock', 'profit_margin');
  }
};
