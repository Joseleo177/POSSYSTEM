'use strict';

// Precisión del dinero en las notas de crédito.
//
// Una devolución se calculaba en moneda base redondeada a dos decimales porque la columna no
// daba para más: `returns.total` era DECIMAL(12,2) y `return_items.subtotal` igual. Con la
// factura cobrada en bolívares eso deja al cliente corto.
//
// El caso real: un producto de $2,40280 se factura por Bs.1895,00 (el precio se convierte y se
// redondea línea por línea, en bolívares). Al devolverlo se le acreditaban $2,40 —los dos
// decimales de la columna—, que a la misma tasa son Bs.1892,79. El cliente pagó 1895 y recibía
// crédito por 1892,79: se le quedaban 2,13 en el camino. Con tasas cercanas a 800 Bs/$, una
// centésima de dólar son ocho bolívares, así que el redondeo intermedio no es despreciable.
//
// Se lleva a DECIMAL(14,6), la misma precisión que ya usan `payments.amount`, `expenses.amount`
// y `customers.credit_balance` — que es donde va a parar el crédito de la nota. `price` sube a
// DECIMAL(14,5) para igualar a `sale_items.price`, de donde se copia: guardarlo con cuatro
// decimales recortaba el precio original antes de multiplicarlo por la cantidad.
//
// Ampliar la precisión no toca los datos ya guardados: las notas viejas conservan el monto con
// el que se emitieron, que es lo correcto para un documento fiscal.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('returns', 'total', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('return_items', 'subtotal', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
    });
    await queryInterface.changeColumn('return_items', 'price', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Volver a dos decimales redondea los montos que hubieran usado la precisión nueva: es
    // pérdida real de información, no una reversión limpia. Se deja porque la migración debe
    // poder deshacerse, pero conviene saber lo que implica.
    await queryInterface.changeColumn('returns', 'total', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('return_items', 'subtotal', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('return_items', 'price', {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: false,
    });
  },
};
