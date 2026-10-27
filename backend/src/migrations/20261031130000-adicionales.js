'use strict';

// Adicionales de los platos (restaurante). Grupos de opciones reutilizables —"Término de la
// carne" (elige 1, obligatorio), "Extras" (opcional, hasta 3)— que se asignan a los platos.
//
// - Una opción sin costo es solo texto: va a la comanda y a la nota de la línea.
// - Una opción con costo es un PRODUCTO (products.is_addon): entra a la venta como línea
//   propia ("+ Queso extra · Ref. 1.00"), con su precio por sucursal, sus promociones, su
//   inventario si se lo dan (servicio o combo) y sus reportes. Así no hay un camino de precio
//   nuevo: es una línea más de las que ya se cobran.
// - is_addon esconde esos productos del menú de la caja, del mesonero y del catálogo público:
//   solo se piden como adicional de un plato.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE IF NOT EXISTS modifier_groups (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER,
        name        VARCHAR(60) NOT NULL,
        min_select  INTEGER NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 20),
        max_select  INTEGER CHECK (max_select IS NULL OR max_select BETWEEN 1 AND 20),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS modifier_groups_company ON modifier_groups (company_id);

      CREATE TABLE IF NOT EXISTS modifier_options (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER,
        group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
        name        VARCHAR(60) NOT NULL,
        product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS modifier_options_group ON modifier_options (group_id);

      CREATE TABLE IF NOT EXISTS product_modifier_groups (
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
        company_id  INTEGER,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (product_id, group_id)
      );
      CREATE INDEX IF NOT EXISTS product_modifier_groups_group ON product_modifier_groups (group_id);

      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE kitchen_ticket_items ADD COLUMN IF NOT EXISTS modifiers VARCHAR(400);
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE kitchen_ticket_items DROP COLUMN IF EXISTS modifiers`);
    await q(`ALTER TABLE products DROP COLUMN IF EXISTS is_addon`);
    await q(`DROP TABLE IF EXISTS product_modifier_groups`);
    await q(`DROP TABLE IF EXISTS modifier_options`);
    await q(`DROP TABLE IF EXISTS modifier_groups`);
  },
};
