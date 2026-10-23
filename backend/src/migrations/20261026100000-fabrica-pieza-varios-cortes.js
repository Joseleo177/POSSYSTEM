'use strict';

/**
 * Una pieza entregada puede cubrir varios cortes distintos de la misma orden.
 *
 * La entrega guardaba UN corte (plan_id) y cuántos cubría (cuts_covered). Pero en el taller de
 * una lámina salen a la vez el cuerpo y las puertas del gabinete: había que entregarla para el
 * cuerpo, devolverla y entregar el retazo para las puertas. Ahora cada entrega tiene sus cortes
 * en fabrication_order_cuts, una fila por corte de la receta. Las entregas que ya tenían corte
 * pasan a la tabla nueva y las dos columnas se van.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_order_cuts (
          id         SERIAL PRIMARY KEY,
          company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          order_id   INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
          use_id     INTEGER NOT NULL REFERENCES fabrication_order_pieces(id) ON DELETE CASCADE,
          plan_id    INTEGER NOT NULL REFERENCES fabrication_order_plan(id) ON DELETE CASCADE,
          cuts       INTEGER NOT NULL CHECK (cuts > 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS fabrication_order_cuts_use_plan_key ON fabrication_order_cuts (use_id, plan_id)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_cuts_plan_idx ON fabrication_order_cuts (plan_id)`);

      const [cols] = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrication_order_pieces' AND column_name = 'plan_id'`);
      if (cols.length) {
        await q(`
          INSERT INTO fabrication_order_cuts (company_id, order_id, use_id, plan_id, cuts, created_at)
          SELECT company_id, order_id, id, plan_id, cuts_covered, delivered_at
            FROM fabrication_order_pieces
           WHERE plan_id IS NOT NULL AND cuts_covered > 0
          ON CONFLICT (use_id, plan_id) DO NOTHING
        `);
      }
      await q(`DROP INDEX IF EXISTS fabrication_order_pieces_plan_idx`);
      await q(`ALTER TABLE fabrication_order_pieces DROP CONSTRAINT IF EXISTS fabrication_order_pieces_cuts_covered_check`);
      await q(`ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS cuts_covered`);
      await q(`ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS plan_id`);
    });
  },

  // De vuelta a un corte por entrega: se queda el primero de cada una.
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES fabrication_order_plan(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS cuts_covered INTEGER`);
      await q(`ALTER TABLE fabrication_order_pieces ADD CONSTRAINT fabrication_order_pieces_cuts_covered_check CHECK (cuts_covered IS NULL OR cuts_covered > 0)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_pieces_plan_idx ON fabrication_order_pieces (plan_id) WHERE plan_id IS NOT NULL`);
      await q(`
        UPDATE fabrication_order_pieces op SET plan_id = c.plan_id, cuts_covered = c.cuts
          FROM (SELECT DISTINCT ON (use_id) use_id, plan_id, cuts FROM fabrication_order_cuts ORDER BY use_id, id) c
         WHERE c.use_id = op.id
      `);
      await q(`DROP TABLE IF EXISTS fabrication_order_cuts`);
    });
  },
};
