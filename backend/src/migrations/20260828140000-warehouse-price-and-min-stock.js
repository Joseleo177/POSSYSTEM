'use strict';

/**
 * Precio y mínimo de reposición por sucursal.
 *
 * Los dos vivían una sola vez por empresa, en `products`. El mínimo, además, se comparaba
 * contra la SUMA de las sucursales: con mínimo 10 y tiendas en 0 / 4 / 30, el total daba 34 y
 * nadie avisaba que dos estaban secas.
 *
 * Van aquí y no en una tabla nueva porque `product_stock` ya es la fila (almacén, producto) y
 * ya existe para todo producto que la sucursal maneja —el catálogo público usa justamente su
 * existencia como criterio de surtido—. La fila ya era, de hecho, la ficha del producto en esa
 * sucursal; ahora lo es del todo. Como el POS ya la carga con lock para descontar existencias,
 * el precio de la sucursal no cuesta una consulta más.
 *
 * NULL en cualquiera de las dos = hereda del producto. Por eso son nullable y no llevan
 * defecto: un 0 sería un precio de cero y un mínimo de cero, no "sin definir".
 */
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Misma precisión que products.price: un DECIMAL más corto metería un redondeo distinto
      // en la pista de bolívares, que se calcula con el precio de 5 decimales sin redondear.
      await q(`ALTER TABLE "product_stock" ADD COLUMN IF NOT EXISTS "price" NUMERIC(14, 5)`);
      // Misma precisión que products.min_stock, que comparte escala con qty.
      await q(`ALTER TABLE "product_stock" ADD COLUMN IF NOT EXISTS "min_stock" NUMERIC(10, 3)`);

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
      await q(`ALTER TABLE "product_stock" DROP COLUMN IF EXISTS "price"`);
      await q(`ALTER TABLE "product_stock" DROP COLUMN IF EXISTS "min_stock"`);
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
