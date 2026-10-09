'use strict';

// El diario pasa a ser la CUENTA, no "una cuenta por método de pago".
//
// Antes: "Pago Movil BDV", "PUNTO BDV" y "BIO PAGO" eran tres diarios del mismo Banco de
// Venezuela, cada uno con su saldo, aunque el dinero estuviera en una sola cuenta. Ahora:
//
//   payment_journals            la cuenta (o la gaveta de efectivo), con su número de cuenta y
//                               su saldo inicial
//   payment_journal_methods     los métodos que esa cuenta acepta, y en qué sentido cada uno
//                               (el punto de BDV hace reintegros, el biopago solo cobra)
//   payments / expenses / ...   guardan POR QUÉ MÉTODO entró o salió el dinero (payment_method)
//
// Pasos:
//   1. Cada diario se vuelve una cuenta con un solo método (su `type` de siempre), con el
//      sentido que ya tenía (allows_inflow/allows_outflow, migración journal-direction).
//   2. Cada movimiento guarda su método, sacado del diario en el que está hoy.
//   3. Se fusionan los diarios de la misma empresa, banco, moneda y sucursales: el que queda
//      (el activo de id menor) recibe los movimientos y los métodos de los demás, y toma el
//      nombre del banco. Los absorbidos quedan inactivos con `merged_into_id`, no se borran.
//      El efectivo no se fusiona: cada gaveta es su propio diario.
//   4. El sentido ya vive en cada método de la cuenta: se quitan las columnas del diario.
//
// La fusión no se puede deshacer de forma automática: `down` lo dice en vez de fingirlo.

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements, type: Sequelize.QueryTypes.SELECT });
    const run = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction: t, replacements });
    try {
      // ── 1. Métodos de cada cuenta ───────────────────────────────────────────────────
      await queryInterface.createTable('payment_journal_methods', {
        id:             { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        journal_id:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'payment_journals', key: 'id' }, onDelete: 'CASCADE' },
        company_id:     { type: Sequelize.INTEGER, allowNull: true },
        method_code:    { type: Sequelize.STRING(30), allowNull: false },
        allows_inflow:  { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        allows_outflow: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        sort_order:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      }, { transaction: t });
      await queryInterface.addIndex('payment_journal_methods', ['journal_id', 'method_code'], { unique: true, name: 'payment_journal_methods_journal_method', transaction: t });

      await run(`
        INSERT INTO payment_journal_methods (journal_id, company_id, method_code, allows_inflow, allows_outflow, sort_order)
        SELECT id, company_id, type, allows_inflow, allows_outflow, 0
          FROM payment_journals
         WHERE COALESCE(type, '') <> ''
      `);

      // ── 2. Método de cada movimiento ────────────────────────────────────────────────
      for (const tabla of ['payments', 'expenses', 'incomes', 'purchase_payments']) {
        await queryInterface.addColumn(tabla, 'payment_method', { type: Sequelize.STRING(30), allowNull: true }, { transaction: t });
        await run(`UPDATE ${tabla} x SET payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.payment_journal_id`);
      }
      // El vuelto sale de su propia caja y por su propio método.
      await queryInterface.addColumn('payments', 'change_payment_method', { type: Sequelize.STRING(30), allowNull: true }, { transaction: t });
      await run(`UPDATE payments x SET change_payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.change_journal_id`);

      // ── Datos de la cuenta ──────────────────────────────────────────────────────────
      await queryInterface.addColumn('payment_journals', 'account_number', { type: Sequelize.STRING(40), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('payment_journals', 'opening_balance', { type: Sequelize.DECIMAL(18, 2), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.addColumn('payment_journals', 'opening_date', { type: Sequelize.DATEONLY, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('payment_journals', 'merged_into_id', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });

      // ── 3. Fusión ───────────────────────────────────────────────────────────────────
      const grupos = await q(`
        WITH wh AS (
          SELECT journal_id, string_agg(warehouse_id::text, ',' ORDER BY warehouse_id) AS w
            FROM payment_journal_warehouses GROUP BY journal_id
        )
        SELECT pj.company_id, pj.bank_id, pj.currency_id, COALESCE(wh.w, '') AS wh,
               array_agg(pj.id ORDER BY pj.active DESC, pj.id) AS ids,
               bool_or(pj.active) AS alguno_activo
          FROM payment_journals pj
          LEFT JOIN wh ON wh.journal_id = pj.id
         WHERE COALESCE(pj.type, '') <> 'efectivo'
           AND pj.bank_id IS NOT NULL
         GROUP BY pj.company_id, pj.bank_id, pj.currency_id, COALESCE(wh.w, '')
        HAVING COUNT(*) > 1
      `);

      for (const g of grupos) {
        const [queda, ...absorbidos] = g.ids.map(Number);
        for (const viejo of absorbidos) {
          const r = { queda, viejo };
          await run(`UPDATE payments          SET payment_journal_id = :queda WHERE payment_journal_id = :viejo`, r);
          await run(`UPDATE payments          SET change_journal_id  = :queda WHERE change_journal_id  = :viejo`, r);
          await run(`UPDATE expenses          SET payment_journal_id = :queda WHERE payment_journal_id = :viejo`, r);
          await run(`UPDATE incomes           SET payment_journal_id = :queda WHERE payment_journal_id = :viejo`, r);
          await run(`UPDATE purchase_payments SET payment_journal_id = :queda WHERE payment_journal_id = :viejo`, r);
          await run(`UPDATE sales             SET payment_journal_id = :queda WHERE payment_journal_id = :viejo`, r);

          // Arqueo: en una sesión donde estaban las dos cajas, las cifras se suman en la que
          // queda; si solo estaba la absorbida, se reapunta.
          await run(`
            UPDATE cash_session_journals s
               SET opening_amount  = COALESCE(s.opening_amount, 0)  + COALESCE(v.opening_amount, 0),
                   expected_amount = CASE WHEN s.expected_amount IS NULL AND v.expected_amount IS NULL THEN NULL
                                          ELSE COALESCE(s.expected_amount, 0) + COALESCE(v.expected_amount, 0) END,
                   closing_amount  = CASE WHEN s.closing_amount IS NULL AND v.closing_amount IS NULL THEN NULL
                                          ELSE COALESCE(s.closing_amount, 0) + COALESCE(v.closing_amount, 0) END,
                   difference      = CASE WHEN s.difference IS NULL AND v.difference IS NULL THEN NULL
                                          ELSE COALESCE(s.difference, 0) + COALESCE(v.difference, 0) END
              FROM cash_session_journals v
             WHERE s.journal_id = :queda AND v.journal_id = :viejo AND v.session_id = s.session_id
          `, r);
          await run(`
            DELETE FROM cash_session_journals v
             WHERE v.journal_id = :viejo
               AND EXISTS (SELECT 1 FROM cash_session_journals s WHERE s.journal_id = :queda AND s.session_id = v.session_id)
          `, r);
          await run(`UPDATE cash_session_journals SET journal_id = :queda WHERE journal_id = :viejo`, r);

          // Los métodos de la absorbida pasan a la cuenta. Si los dos tenían el mismo método,
          // vale el sentido más amplio.
          await run(`
            INSERT INTO payment_journal_methods (journal_id, company_id, method_code, allows_inflow, allows_outflow, sort_order)
            SELECT :queda, company_id, method_code, allows_inflow, allows_outflow,
                   (SELECT COUNT(*) FROM payment_journal_methods WHERE journal_id = :queda)
              FROM payment_journal_methods WHERE journal_id = :viejo
            ON CONFLICT (journal_id, method_code) DO UPDATE
               SET allows_inflow  = payment_journal_methods.allows_inflow  OR EXCLUDED.allows_inflow,
                   allows_outflow = payment_journal_methods.allows_outflow OR EXCLUDED.allows_outflow
          `, r);

          await run(`
            UPDATE payment_journals
               SET active = false, merged_into_id = :queda, name = LEFT(name, 186) || ' (fusionado)'
             WHERE id = :viejo
          `, r);
        }
        // La cuenta toma el nombre del banco: ya no es "Pago Movil BDV" sino la cuenta entera.
        await run(`
          UPDATE payment_journals pj SET name = b.name, active = :activo
            FROM banks b WHERE pj.id = :queda AND b.id = pj.bank_id
        `, { queda, activo: !!g.alguno_activo });
        console.log(`[journal-accounts] empresa ${g.company_id}: diarios ${absorbidos.join(", ")} fusionados en ${queda}`);
      }

      // ── Conciliación por cuenta ─────────────────────────────────────────────────────
      // El extracto era de "banco + moneda": dos cuentas del mismo banco se mezclaban. Ahora
      // cada extracto es de un diario. Los existentes van al diario vivo de ese banco y moneda,
      // prefiriendo el de su sucursal.
      await queryInterface.addColumn('bank_statements', 'journal_id', {
        type: Sequelize.INTEGER, allowNull: true, references: { model: 'payment_journals', key: 'id' }, onDelete: 'SET NULL',
      }, { transaction: t });
      await run(`
        UPDATE bank_statements st SET journal_id = (
          SELECT pj.id FROM payment_journals pj
           WHERE pj.company_id = st.company_id AND pj.bank_id = st.bank_id
             AND pj.currency_id IS NOT DISTINCT FROM st.currency_id
             AND pj.merged_into_id IS NULL AND COALESCE(pj.type, '') <> 'efectivo'
           ORDER BY (EXISTS (SELECT 1 FROM payment_journal_warehouses w
                              WHERE w.journal_id = pj.id AND w.warehouse_id = st.warehouse_id)) DESC,
                    pj.active DESC, pj.id
           LIMIT 1)
      `);
      await queryInterface.addIndex('bank_statements', ['journal_id'], { name: 'bank_statements_journal_idx', transaction: t });

      // ── 4. El sentido vive en cada método de la cuenta ──────────────────────────────
      await queryInterface.removeColumn('payment_journals', 'allows_inflow', { transaction: t });
      await queryInterface.removeColumn('payment_journals', 'allows_outflow', { transaction: t });

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  down: async () => {
    throw new Error("journal-accounts: la fusión de diarios no se deshace automáticamente. Restaura el respaldo previo.");
  },
};
