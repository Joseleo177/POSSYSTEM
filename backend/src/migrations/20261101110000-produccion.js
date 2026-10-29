'use strict';

// Producción de cocina (app Recetas, fase 2): preparaciones que se hacen por tanda —la olla de
// sopa, la salsa, el fondo, la masa— y se guardan con existencia propia.
//
// - Una preparación es un producto normal (con existencia, no se vende suelto) cuya ficha en
//   recipe_sheets es kind = 'preparacion' y dice cuánto rinde una tanda (batch_yield: 30
//   porciones, 4 litros). Su receta de tanda va en preparation_items: lo que lleva UNA olla.
//   No usa product_combo_items a propósito: un combo no tiene existencia y se descuenta al
//   vender; la preparación se descuenta al producir y se vende por porciones.
//
// - production_batches es cada tanda hecha (OP-0001): lo que se gastó de verdad y lo que salió
//   de verdad. Descuenta los insumos, suma lo que salió a la preparación y deja su costo real
//   (lo gastado ÷ lo que salió) en la ficha de la sucursal. Cada movimiento deja su línea de
//   sesión con motivo 'produccion' y notas "OP-0001 · ...", que el kardex muestra.
//
// - El plato que se vende ("Sancocho de res") lleva en su receta 1 porción de la preparación.
//
// Permiso nuevo production.view / production.manage: se concede a quien ya marcaba comandas
// (la cocina) o ajustaba inventario.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      ALTER TABLE recipe_sheets ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'plato';
      ALTER TABLE recipe_sheets ADD COLUMN IF NOT EXISTS batch_yield NUMERIC(12,3);

      CREATE TABLE IF NOT EXISTS preparation_items (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        prep_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity      NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
        net_quantity  NUMERIC(12,3),
        waste_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (waste_pct >= 0 AND waste_pct < 100)
      );
      CREATE INDEX IF NOT EXISTS preparation_items_prep ON preparation_items (prep_id);
      CREATE INDEX IF NOT EXISTS preparation_items_product ON preparation_items (product_id);

      CREATE TABLE IF NOT EXISTS production_batches (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        number          INTEGER NOT NULL,
        warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
        product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        batches         NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (batches > 0),
        expected_yield  NUMERIC(12,3),
        actual_yield    NUMERIC(12,3) NOT NULL CHECK (actual_yield > 0),
        total_cost      NUMERIC(14,4) NOT NULL DEFAULT 0,
        unit_cost       NUMERIC(14,4) NOT NULL DEFAULT 0,
        notes           VARCHAR(300),
        status          VARCHAR(10) NOT NULL DEFAULT 'hecha' CHECK (status IN ('hecha', 'anulada')),
        employee_id     INTEGER,
        annulled_at     TIMESTAMPTZ,
        annulled_by     INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, number)
      );
      CREATE INDEX IF NOT EXISTS production_batches_product ON production_batches (product_id);

      CREATE TABLE IF NOT EXISTS production_batch_items (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        batch_id      INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        expected_qty  NUMERIC(12,3),
        actual_qty    NUMERIC(12,3) NOT NULL CHECK (actual_qty > 0),
        unit_cost     NUMERIC(14,4) NOT NULL DEFAULT 0,
        cost          NUMERIC(14,4) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS production_batch_items_batch ON production_batch_items (batch_id);

      UPDATE roles
         SET permissions = permissions || '{"production.view": true, "production.manage": true}'::jsonb
       WHERE (permissions->>'kitchen.manage') = 'true' OR (permissions->>'inventory.adjust') = 'true'
          OR (permissions->>'inventory') = 'true';
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`UPDATE roles SET permissions = permissions - 'production.view' - 'production.manage'`);
    await q(`DROP TABLE IF EXISTS production_batch_items`);
    await q(`DROP TABLE IF EXISTS production_batches`);
    await q(`DROP TABLE IF EXISTS preparation_items`);
    await q(`ALTER TABLE recipe_sheets DROP COLUMN IF EXISTS batch_yield`);
    await q(`ALTER TABLE recipe_sheets DROP COLUMN IF EXISTS kind`);
  },
};
