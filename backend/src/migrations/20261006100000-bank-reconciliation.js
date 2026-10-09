'use strict';

/**
 * Conciliación bancaria.
 *
 * Hasta hoy un cobro por pago móvil o transferencia quedaba registrado con lo que dijo el
 * cajero: nadie confirmaba que el dinero hubiera llegado al banco. Ahora se sube el extracto
 * de la cuenta y cada línea se casa con lo que el sistema tiene (cobros, ingresos y egresos).
 *
 *   bank_statements                 un extracto subido: cuenta (banco + moneda), período, archivo
 *   bank_statement_lines            sus movimientos tal como los trae el banco
 *   bank_reconciliation_matches     qué documento del sistema explica cada línea
 *
 * La cuenta no es una tabla nueva: es el par banco + moneda de los diarios que no son de
 * efectivo, el mismo criterio con que el Estado de Cuenta agrupa un banco (getBankMovements).
 *
 * Un documento se concilia una sola vez en toda la empresa: el índice único sobre
 * (source_type, source_id) impide que el mismo cobro explique dos líneas de banco.
 *
 * Permiso nuevo `accounting.reconcile`. Registra egresos (comisiones) e ingresos desde el
 * extracto, así que se le concede a quien ya podía registrar egresos.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE IF NOT EXISTS bank_statements (
          id               SERIAL PRIMARY KEY,
          company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          bank_id          INTEGER NOT NULL REFERENCES banks(id),
          currency_id      INTEGER REFERENCES currencies(id),
          warehouse_id     INTEGER REFERENCES warehouses(id),
          bank_format      VARCHAR(40),
          filename         VARCHAR(255),
          date_from        DATE,
          date_to          DATE,
          opening_balance  DECIMAL(18,2),
          closing_balance  DECIMAL(18,2),
          employee_id      INTEGER REFERENCES employees(id),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS bank_statements_account_idx ON bank_statements (company_id, bank_id, currency_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS bank_statement_lines (
          id                 SERIAL PRIMARY KEY,
          company_id         INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          statement_id       INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
          line_no            INTEGER NOT NULL DEFAULT 0,
          date               DATE NOT NULL,
          description        VARCHAR(500) NOT NULL DEFAULT '',
          reference          VARCHAR(100),
          debit              DECIMAL(18,2) NOT NULL DEFAULT 0,
          credit             DECIMAL(18,2) NOT NULL DEFAULT 0,
          balance            DECIMAL(18,2),
          -- movimiento | comision | impuesto | interes: lo que el banco dice que es la línea.
          kind               VARCHAR(20) NOT NULL DEFAULT 'movimiento',
          -- pendiente | conciliado | ignorado
          status             VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          -- auto | manual | registrado: cómo se resolvió (solo informativo).
          match_mode         VARCHAR(20),
          -- Comisión que el banco descontó dentro del abono (lote del punto de venta).
          difference         DECIMAL(18,2) NOT NULL DEFAULT 0,
          note               VARCHAR(255),
          resolved_by        INTEGER REFERENCES employees(id),
          resolved_at        TIMESTAMPTZ
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS bank_statement_lines_statement_idx ON bank_statement_lines (statement_id, line_no)`);
      await q(`CREATE INDEX IF NOT EXISTS bank_statement_lines_status_idx ON bank_statement_lines (company_id, status)`);

      await q(`
        CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
          id           SERIAL PRIMARY KEY,
          company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          line_id      INTEGER NOT NULL REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
          -- payment | income | expense. Sin FK a propósito: son tres tablas distintas.
          source_type  VARCHAR(20) NOT NULL,
          source_id    INTEGER NOT NULL,
          -- documento: ya existía y se casó.  creado: lo generó la conciliación (comisión o
          -- movimiento registrado desde el extracto) y se anula si se deshace.
          role         VARCHAR(20) NOT NULL DEFAULT 'documento',
          amount       DECIMAL(18,6) NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_source_key ON bank_reconciliation_matches (source_type, source_id)`);
      await q(`CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_line_idx ON bank_reconciliation_matches (line_id)`);

      await q(`
        UPDATE roles
           SET permissions = permissions || '{"accounting.reconcile": true}'::jsonb
         WHERE (permissions->>'accounting.expense')::boolean IS TRUE
           AND permissions->'accounting.reconcile' IS NULL
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP TABLE IF EXISTS bank_reconciliation_matches`);
      await q(`DROP TABLE IF EXISTS bank_statement_lines`);
      await q(`DROP TABLE IF EXISTS bank_statements`);
      await q(`UPDATE roles SET permissions = permissions - 'accounting.reconcile' WHERE permissions->'accounting.reconcile' IS NOT NULL`);
    });
  },
};
