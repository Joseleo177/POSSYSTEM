'use strict';

/**
 * Fábrica, segunda parte: recetas con fórmulas, etapas del taller y mano de obra.
 *
 *   fabrication_stages         las etapas que define cada empresa (Corte, Doblez, Soldadura...)
 *                              con su costo por hora: así la nómina, aunque se pague fija, se
 *                              reparte en lo que se fabrica
 *   fabrication_recipes        una por producto. Declara sus variables (largo, ancho, puertas)
 *                              y la unidad en que se escriben las medidas de sus fórmulas
 *   fabrication_recipe_items   sus líneas, POR UNIDAD, como fórmulas:
 *                                material   cortes de un material por piezas (ancho, largo, cuántos)
 *                                accesorio  cantidad de un producto normal
 *                                proceso    minutos en una etapa
 *   fabrication_order_plan     la receta ya calculada con los valores de la orden, por unidad.
 *                              Editar la receta después no cambia una orden vieja
 *   fabrication_order_stages   el paso de la orden por cada etapa: quién, cuántos minutos y a
 *                              qué costo por hora (el de ese momento)
 *
 * Las fórmulas se guardan como texto y las evalúa services/factory/formula.js, un intérprete
 * propio de aritmética: jamás pasan por eval.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_stages (
          id            SERIAL PRIMARY KEY,
          company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          name          VARCHAR(60) NOT NULL,
          position      INTEGER NOT NULL DEFAULT 0,
          cost_per_hour DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (cost_per_hour >= 0),
          active        BOOLEAN NOT NULL DEFAULT true,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS fabrication_stages_name_key ON fabrication_stages (company_id, lower(name))`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_recipes (
          id           SERIAL PRIMARY KEY,
          company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          product_id   INTEGER NOT NULL REFERENCES products(id),
          -- Unidad de las medidas en las fórmulas y en las variables de tipo medida.
          unit         VARCHAR(2) NOT NULL DEFAULT 'm' CHECK (unit IN ('m', 'cm', 'mm')),
          -- [{ key: "L", label: "Largo", kind: "medida" | "numero", default: 1.8 }]
          params       JSONB NOT NULL DEFAULT '[]'::jsonb,
          instructions TEXT,
          employee_id  INTEGER REFERENCES employees(id),
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS fabrication_recipes_product_key ON fabrication_recipes (company_id, product_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_recipe_items (
          id            SERIAL PRIMARY KEY,
          company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          recipe_id     INTEGER NOT NULL REFERENCES fabrication_recipes(id) ON DELETE CASCADE,
          kind          VARCHAR(20) NOT NULL CHECK (kind IN ('material', 'accesorio', 'proceso')),
          component_id  INTEGER REFERENCES products(id),
          stage_id      INTEGER REFERENCES fabrication_stages(id),
          width_expr    VARCHAR(200),
          length_expr   VARCHAR(200),
          cuts_expr     VARCHAR(200),
          quantity_expr VARCHAR(200),
          minutes_expr  VARCHAR(200),
          position      INTEGER NOT NULL DEFAULT 0,
          CHECK (
            (kind = 'material'  AND component_id IS NOT NULL AND length_expr IS NOT NULL AND cuts_expr IS NOT NULL) OR
            (kind = 'accesorio' AND component_id IS NOT NULL AND quantity_expr IS NOT NULL) OR
            (kind = 'proceso'   AND stage_id IS NOT NULL AND minutes_expr IS NOT NULL)
          )
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_recipe_items_recipe_idx ON fabrication_recipe_items (recipe_id)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_recipe_items_component_idx ON fabrication_recipe_items (component_id)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_recipe_items_stage_idx ON fabrication_recipe_items (stage_id)`);

      // Ya calculado: números, no fórmulas.
      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_order_plan (
          id             SERIAL PRIMARY KEY,
          company_id     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          order_id       INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
          kind           VARCHAR(20) NOT NULL CHECK (kind IN ('material', 'accesorio', 'proceso')),
          component_id   INTEGER REFERENCES products(id),
          stage_id       INTEGER REFERENCES fabrication_stages(id),
          name           VARCHAR(200) NOT NULL,
          cut_width_mm   INTEGER CHECK (cut_width_mm IS NULL OR cut_width_mm > 0),
          cut_length_mm  INTEGER CHECK (cut_length_mm IS NULL OR cut_length_mm > 0),
          cuts           INTEGER CHECK (cuts IS NULL OR cuts > 0),
          quantity       DECIMAL(10,3) CHECK (quantity IS NULL OR quantity > 0),
          minutes        DECIMAL(10,2) CHECK (minutes IS NULL OR minutes >= 0),
          position       INTEGER NOT NULL DEFAULT 0
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_plan_order_idx ON fabrication_order_plan (order_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_order_stages (
          id            SERIAL PRIMARY KEY,
          company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          order_id      INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
          stage_id      INTEGER NOT NULL REFERENCES fabrication_stages(id),
          stage_name    VARCHAR(60) NOT NULL,
          started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at   TIMESTAMPTZ,
          minutes       DECIMAL(10,2) CHECK (minutes IS NULL OR minutes >= 0),
          cost_per_hour DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (cost_per_hour >= 0),
          cost          DECIMAL(14,4) CHECK (cost IS NULL OR cost >= 0),
          worker        VARCHAR(80),
          note          VARCHAR(300),
          employee_id   INTEGER REFERENCES employees(id)
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_stages_order_idx ON fabrication_order_stages (order_id, started_at)`);
      // Una orden está en una sola etapa a la vez.
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS fabrication_order_stages_open_key ON fabrication_order_stages (order_id) WHERE finished_at IS NULL`);

      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS instructions TEXT`);
      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS params JSONB`);
      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS current_stage_id INTEGER REFERENCES fabrication_stages(id)`);
      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(14,4) NOT NULL DEFAULT 0`);
      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS due_date DATE`);
      await q(`ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS assignee VARCHAR(80)`);
      await q(`ALTER TABLE fabrication_orders DROP CONSTRAINT IF EXISTS fabrication_orders_labor_cost_check`);
      await q(`ALTER TABLE fabrication_orders ADD CONSTRAINT fabrication_orders_labor_cost_check CHECK (labor_cost >= 0)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_orders_stage_idx ON fabrication_orders (company_id, current_stage_id) WHERE status = 'abierta'`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS fabrication_orders_stage_idx`);
      await q(`ALTER TABLE fabrication_orders DROP CONSTRAINT IF EXISTS fabrication_orders_labor_cost_check`);
      for (const col of ["assignee", "due_date", "labor_cost", "current_stage_id", "params", "instructions"]) {
        await q(`ALTER TABLE fabrication_orders DROP COLUMN IF EXISTS ${col}`);
      }
      await q(`DROP TABLE IF EXISTS fabrication_order_stages`);
      await q(`DROP TABLE IF EXISTS fabrication_order_plan`);
      await q(`DROP TABLE IF EXISTS fabrication_recipe_items`);
      await q(`DROP TABLE IF EXISTS fabrication_recipes`);
      await q(`DROP TABLE IF EXISTS fabrication_stages`);
    });
  },
};
