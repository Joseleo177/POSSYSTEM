'use strict';

/**
 * Promociones por sucursal.
 *
 * Una promoción pensada para una tienda se aplicaba en todas: `promotions` no sabía de
 * almacenes. NULL sigue significando "todas las sucursales", que es exactamente lo que son
 * hoy las promociones existentes, así que no hace falta rellenar nada.
 *
 * ON DELETE CASCADE: si se borra la sucursal, su promoción se va con ella. Dejarla huérfana
 * la convertiría en una promoción sin dueño que nadie sabría por qué sigue descontando.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "promotions"
        ADD COLUMN IF NOT EXISTS "warehouse_id" INTEGER
        REFERENCES "warehouses"("id") ON DELETE CASCADE
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE "promotions" DROP COLUMN IF EXISTS "warehouse_id"`);
  },
};
