'use strict';

/**
 * Entregas atadas a un corte de la receta.
 *
 * Antes, entregar una pieza "para" un corte de la receta solo abría el buscador filtrado: la
 * entrega no recordaba a qué corte iba, así que nadie comprobaba que la pieza alcanzara (una
 * lámina de 1,22 × 2,44 da UN corte de 0,8 × 2,1, no dos) ni la receta mostraba qué estaba
 * cubierto. Ahora la entrega guarda el corte (plan_id) y cuántos cortes de ese tipo cubre la
 * pieza (cuts_covered), calculado al entregarla.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES fabrication_order_plan(id) ON DELETE SET NULL`);
      await q(`ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS cuts_covered INTEGER`);
      await q(`ALTER TABLE fabrication_order_pieces DROP CONSTRAINT IF EXISTS fabrication_order_pieces_cuts_covered_check`);
      await q(`ALTER TABLE fabrication_order_pieces ADD CONSTRAINT fabrication_order_pieces_cuts_covered_check CHECK (cuts_covered IS NULL OR cuts_covered > 0)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_pieces_plan_idx ON fabrication_order_pieces (plan_id) WHERE plan_id IS NOT NULL`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS fabrication_order_pieces_plan_idx`);
      await q(`ALTER TABLE fabrication_order_pieces DROP CONSTRAINT IF EXISTS fabrication_order_pieces_cuts_covered_check`);
      await q(`ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS cuts_covered`);
      await q(`ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS plan_id`);
    });
  },
};
