'use strict';

// Precisión del total de la compra.
//
// `purchases.total` seguía en DECIMAL(10,2) —el tipo original— mientras que las líneas ya se
// habían llevado a DECIMAL(14,5) (migración 20260617000000). El total se guarda en moneda base
// como Σ subtotal, así que al escribirlo Postgres lo redondeaba a dos decimales de la base.
//
// El caso real: una factura cargada en bolívares con tasa ~813 Bs/$. El borrador muestra el
// total sumando las líneas a plena precisión (682.805,97 Bs). Al recibir la mercancía, el
// "Resumen Financiero" lee `purchases.total`, que ya venía redondeado a dos decimales de dólar
// —y una centésima de dólar son ocho bolívares—, de modo que el monto "se movía" un poco
// respecto de la suma de las líneas y del papel del proveedor.
//
// Se lleva a DECIMAL(14,6), la misma precisión que `returns.total`, `payments.amount` y
// `expenses.amount`. `purchase_items.subtotal` sube a la par para que la suma no arrastre el
// recorte de las líneas. `package_price`/`unit_cost`/`sale_price` se quedan en 14,5 (igual que
// `sale_items.price`).
//
// Backfill: `total` siempre fue Σ subtotal por diseño, así que se recalcula sobre la precisión
// nueva. Cambia como mucho unos céntimos de bolívar por orden y deja cada compra cuadrada con
// sus líneas. Si prefieres no tocar los históricos, comenta el bloque de UPDATE.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('purchase_items', 'subtotal', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchases', 'total', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      UPDATE purchases p
         SET total = COALESCE(s.t, 0)
        FROM (
          SELECT purchase_id, SUM(subtotal) AS t
            FROM purchase_items
           GROUP BY purchase_id
        ) s
       WHERE s.purchase_id = p.id
         AND p.total <> COALESCE(s.t, 0)
    `);
  },

  async down(queryInterface, Sequelize) {
    // Volver a dos decimales redondea los totales que hubieran usado la precisión nueva: es
    // pérdida real de información. Se deja para poder revertir el tipo, no los datos.
    await queryInterface.changeColumn('purchases', 'total', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('purchase_items', 'subtotal', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
  },
};
