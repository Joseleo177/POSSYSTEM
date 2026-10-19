'use strict';

/**
 * Ventas hechas sin conexión.
 *
 * Una caja que se queda sin internet (o sin luz y arranca sin red) sigue vendiendo y guarda
 * las ventas en el equipo; al volver la conexión las envía a POST /sales/offline.
 *
 * offline_at:  hora real de la venta. created_at es la de llegada, cuando se factura y toma
 *              correlativo, para que los números sigan el orden de las fechas.
 * offline_ref: número del ticket provisional que se le entregó al cliente.
 *
 * Además se quita el CHECK (qty >= 0) de las existencias. Una venta sin conexión ya entregó la
 * mercancía: si al llegar no alcanza (otra caja vendió la última unidad, o el conteo estaba
 * mal) se registra igual y el producto queda en negativo, a la vista, en vez de perder la
 * venta. Los caminos en línea siguen validando existencias antes de descontar.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_at TIMESTAMPTZ`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_ref VARCHAR(40)`);
      await q(`CREATE INDEX IF NOT EXISTS sales_offline_at_idx ON sales (offline_at) WHERE offline_at IS NOT NULL`);
      await q(`ALTER TABLE product_stock DROP CONSTRAINT IF EXISTS product_stock_qty_check`);
      await q(`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_check`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      // NOT VALID: vuelve a regir para lo nuevo sin fallar por los negativos que ya existan.
      await q(`ALTER TABLE product_stock ADD CONSTRAINT product_stock_qty_check CHECK (qty >= 0) NOT VALID`);
      await q(`ALTER TABLE products ADD CONSTRAINT products_stock_check CHECK (stock >= 0) NOT VALID`);
      await q(`DROP INDEX IF EXISTS sales_offline_at_idx`);
      await q(`ALTER TABLE sales DROP COLUMN IF EXISTS offline_ref`);
      await q(`ALTER TABLE sales DROP COLUMN IF EXISTS offline_at`);
    });
  },
};
