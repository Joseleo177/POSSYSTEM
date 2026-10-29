'use strict';

// QR de las mesas. Cada mesa tiene un código secreto (public_token) y su QR abre /mesa/<código>:
// el cliente ve cómo va su pedido (cada ronda y su estado en cocina), el total, y puede pedir la
// cuenta. Es un código al azar y no el id, para que nadie recorra las mesas de otros cambiando
// un número. Las mesas existentes reciben el suyo aquí; las nuevas, al crearse (DiningTable).
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS public_token VARCHAR(32);
      UPDATE dining_tables
         SET public_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20)
       WHERE public_token IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS dining_tables_public_token ON dining_tables (public_token);
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX IF EXISTS dining_tables_public_token`);
    await q(`ALTER TABLE dining_tables DROP COLUMN IF EXISTS public_token`);
  },
};
