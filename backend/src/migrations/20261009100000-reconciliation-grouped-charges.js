'use strict';

/**
 * Comisiones agrupadas en la conciliación bancaria.
 *
 * "Registrar comisiones" creaba un egreso por cada línea del extracto: un mes del BDV dejaba 97
 * egresos de Bs 14 en la lista. Ahora crea UNO por extracto (y tipo: comisiones, impuestos,
 * intereses) y cada línea queda casada contra ese mismo documento.
 *
 * El índice único sobre (source_type, source_id) impedía justamente eso. Se mantiene para los
 * documentos que ya existían en el sistema (role 'documento': un cobro explica una sola línea
 * del banco) y se libera para los que crea la conciliación (role 'creado').
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS bank_reconciliation_matches_source_key`);
      await q(`
        CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_document_key
            ON bank_reconciliation_matches (source_type, source_id)
         WHERE role = 'documento'
      `);
      await q(`CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_source_idx ON bank_reconciliation_matches (source_type, source_id)`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS bank_reconciliation_matches_document_key`);
      await q(`DROP INDEX IF EXISTS bank_reconciliation_matches_source_idx`);
      // Solo vuelve si ningún documento creado está casado con más de una línea.
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_source_key ON bank_reconciliation_matches (source_type, source_id)`);
    });
  },
};
