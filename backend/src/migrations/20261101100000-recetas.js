'use strict';

// Recetas de cocina (app Recetas). La receta de un plato es su lista de product_combo_items:
// es lo que createSale y compañía ya descuentan al vender, y lo que anular, devolver y el
// kardex ya saben revertir. Esta migración le agrega lo que pide una ficha técnica:
//
// - product_combo_items.net_quantity / waste_pct: lo que va al plato (250 g de lomo limpio) y
//   la merma del insumo (20 %). `quantity` sigue siendo lo que se descuenta —el bruto, 313 g—,
//   así que los caminos de venta no cambian. Sin net_quantity (combos de antes) el neto es
//   `quantity` y la merma 0.
//
// - recipe_sheets: lo que no cabe en las líneas (instrucciones, minutos de preparación) y
//   `combo_since`, el momento en que un plato que era servicio pasó a descontar su receta.
//   Las ventas de antes nunca descontaron nada, así que anularlas no debe reponer nada.
//
// - sale_items.components: la foto de lo que descontó la línea, por unidad vendida
//   ([{ product_id, quantity }]). Las recetas de cocina se ajustan seguido (un chef cambia
//   los gramos); sin la foto, anular, devolver y el kardex usaban la receta de HOY y
//   reponían otra cosa de lo que salió. Null en las líneas de antes: siguen con la receta
//   actual, como hasta ahora (ver services/products/recipeStock.js).
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      ALTER TABLE product_combo_items ADD COLUMN IF NOT EXISTS net_quantity NUMERIC(10,3);
      ALTER TABLE product_combo_items ADD COLUMN IF NOT EXISTS waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
      DO $$ BEGIN
        ALTER TABLE product_combo_items ADD CONSTRAINT product_combo_items_waste_check CHECK (waste_pct >= 0 AND waste_pct < 100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS recipe_sheets (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
        instructions  TEXT,
        prep_minutes  INTEGER CHECK (prep_minutes IS NULL OR prep_minutes BETWEEN 0 AND 1440),
        combo_since   TIMESTAMPTZ,
        updated_by    INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS recipe_sheets_company ON recipe_sheets (company_id);

      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS components JSONB;
      -- El kardex de un insumo busca las líneas que lo descontaron (components @> ...).
      CREATE INDEX IF NOT EXISTS sale_items_components_gin
          ON sale_items USING GIN (components jsonb_path_ops) WHERE components IS NOT NULL;
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX IF EXISTS sale_items_components_gin`);
    await q(`ALTER TABLE sale_items DROP COLUMN IF EXISTS components`);
    await q(`DROP TABLE IF EXISTS recipe_sheets`);
    await q(`ALTER TABLE product_combo_items DROP CONSTRAINT IF EXISTS product_combo_items_waste_check`);
    await q(`ALTER TABLE product_combo_items DROP COLUMN IF EXISTS waste_pct`);
    await q(`ALTER TABLE product_combo_items DROP COLUMN IF EXISTS net_quantity`);
  },
};
