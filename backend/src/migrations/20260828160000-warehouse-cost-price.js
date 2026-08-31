'use strict';

/**
 * Costo por sucursal.
 *
 * `products.cost_price` es uno solo para toda la empresa: la última compra recibida en
 * cualquier almacén lo pisaba para todos. Con dos sucursales que compran al mismo proveedor
 * en semanas distintas —o a proveedores distintos—, el margen de una se calculaba con el
 * costo de la otra.
 *
 * NULL = hereda del producto, igual que `price` y `min_stock`. Una sucursal que nunca ha
 * recibido mercancía de ese producto no tiene costo propio que mostrar, y el del catálogo es
 * la mejor referencia disponible.
 *
 * Sin backfill a propósito: copiar hoy el costo global a cada sucursal sería inventar un dato
 * que nadie midió. Cada almacén toma el suyo cuando reciba su próxima compra o transferencia.
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Misma precisión que products.cost_price (14,4).
      await q(`ALTER TABLE "product_stock" ADD COLUMN IF NOT EXISTS "cost_price" NUMERIC(14, 4)`);

      // El costo con que la mercancía salió del origen, para acreditarlo en el destino cuando
      // se reciba. Va en la línea y no se recalcula: entre el despacho y la recepción pueden
      // pasar días, y lo que llegó vale lo que valía cuando salió.
      await q(`ALTER TABLE "stock_transfer_items" ADD COLUMN IF NOT EXISTS "unit_cost" NUMERIC(14, 4)`);

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await q(`ALTER TABLE "product_stock" DROP COLUMN IF EXISTS "cost_price"`);
      await q(`ALTER TABLE "stock_transfer_items" DROP COLUMN IF EXISTS "unit_cost"`);
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
