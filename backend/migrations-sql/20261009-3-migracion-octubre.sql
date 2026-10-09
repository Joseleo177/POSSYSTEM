-- MIGRACIÓN DE OCTUBRE 2026, en SQL para el editor de Supabase.
--
-- Equivale a correr `db:migrate` con estas 5 migraciones del repo, en este orden:
--   20260915100000-increase-discount-precision     descuento con 5 decimales
--   20261006100000-bank-reconciliation             tablas de la conciliación, permiso nuevo
--   20261006120000-journal-direction               recibe/paga por diario (paso intermedio)
--   20261006140000-journal-accounts                el diario es la cuenta: métodos y FUSIÓN
--   20261009100000-reconciliation-grouped-charges  comisiones en un solo egreso
-- y además activa RLS en las tablas nuevas y las registra en SequelizeMeta.
--
-- ANTES: haber corrido 20261009-0b-respaldo-antes-de-migrar.sql (diferencia 0 en todo).
-- Todo va en UNA transacción: si algo falla, no queda nada a medias.
-- Probado contra las migraciones reales del repo: mismo esquema y mismos datos.
-- Después: correr 20261009-2-rls-y-verificacion.sql.

BEGIN;

-- ── 1. 20260915100000-increase-discount-precision ──────────────────────────────────────
ALTER TABLE sales      ALTER COLUMN discount_amount SET NOT NULL;
ALTER TABLE sales      ALTER COLUMN discount_amount SET DEFAULT 0;
ALTER TABLE sales      ALTER COLUMN discount_amount TYPE DECIMAL(14,5);
ALTER TABLE quotations ALTER COLUMN discount_amount SET NOT NULL;
ALTER TABLE quotations ALTER COLUMN discount_amount SET DEFAULT 0;
ALTER TABLE quotations ALTER COLUMN discount_amount TYPE DECIMAL(14,5);

-- ── 2. 20261006100000-bank-reconciliation ──────────────────────────────────────────────
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
);
CREATE INDEX IF NOT EXISTS bank_statements_account_idx ON bank_statements (company_id, bank_id, currency_id);

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
  kind               VARCHAR(20) NOT NULL DEFAULT 'movimiento',
  status             VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  match_mode         VARCHAR(20),
  difference         DECIMAL(18,2) NOT NULL DEFAULT 0,
  note               VARCHAR(255),
  resolved_by        INTEGER REFERENCES employees(id),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS bank_statement_lines_statement_idx ON bank_statement_lines (statement_id, line_no);
CREATE INDEX IF NOT EXISTS bank_statement_lines_status_idx    ON bank_statement_lines (company_id, status);

CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  line_id      INTEGER NOT NULL REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  source_type  VARCHAR(20) NOT NULL,
  source_id    INTEGER NOT NULL,
  role         VARCHAR(20) NOT NULL DEFAULT 'documento',
  amount       DECIMAL(18,6) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_line_idx ON bank_reconciliation_matches (line_id);

UPDATE roles
   SET permissions = permissions || '{"accounting.reconcile": true}'::jsonb
 WHERE (permissions->>'accounting.expense')::boolean IS TRUE
   AND permissions->'accounting.reconcile' IS NULL;

-- ── 3. 20261006120000-journal-direction (paso intermedio: alimenta los métodos) ─────────
ALTER TABLE payment_journals ADD COLUMN allows_inflow  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE payment_journals ADD COLUMN allows_outflow BOOLEAN NOT NULL DEFAULT true;
UPDATE payment_journals pj SET allows_outflow = pm.allows_outflow
  FROM payment_methods pm WHERE pm.code = pj.type AND pm.company_id IS NULL;
UPDATE payment_journals pj SET allows_outflow = pm.allows_outflow
  FROM payment_methods pm WHERE pm.code = pj.type AND pm.company_id = pj.company_id;

-- ── 4. 20261006140000-journal-accounts ─────────────────────────────────────────────────
CREATE TABLE payment_journal_methods (
  id             SERIAL PRIMARY KEY,
  journal_id     INTEGER NOT NULL REFERENCES payment_journals(id) ON DELETE CASCADE,
  company_id     INTEGER,
  method_code    VARCHAR(30) NOT NULL,
  allows_inflow  BOOLEAN NOT NULL DEFAULT true,
  allows_outflow BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX payment_journal_methods_journal_method ON payment_journal_methods (journal_id, method_code);

-- Cada diario se vuelve una cuenta con su método de siempre, con el sentido que ya tenía.
INSERT INTO payment_journal_methods (journal_id, company_id, method_code, allows_inflow, allows_outflow, sort_order)
SELECT id, company_id, type, allows_inflow, allows_outflow, 0
  FROM payment_journals
 WHERE COALESCE(type, '') <> '';

-- Cada movimiento guarda su método, sacado del diario en el que está hoy (antes de fusionar).
ALTER TABLE payments          ADD COLUMN payment_method VARCHAR(30);
UPDATE payments x          SET payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.payment_journal_id;
ALTER TABLE expenses          ADD COLUMN payment_method VARCHAR(30);
UPDATE expenses x          SET payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.payment_journal_id;
ALTER TABLE incomes           ADD COLUMN payment_method VARCHAR(30);
UPDATE incomes x           SET payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.payment_journal_id;
ALTER TABLE purchase_payments ADD COLUMN payment_method VARCHAR(30);
UPDATE purchase_payments x SET payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.payment_journal_id;
ALTER TABLE payments ADD COLUMN change_payment_method VARCHAR(30);
UPDATE payments x SET change_payment_method = pj.type FROM payment_journals pj WHERE pj.id = x.change_journal_id;

-- Datos de la cuenta.
ALTER TABLE payment_journals ADD COLUMN account_number  VARCHAR(40);
ALTER TABLE payment_journals ADD COLUMN opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE payment_journals ADD COLUMN opening_date    DATE;
ALTER TABLE payment_journals ADD COLUMN merged_into_id  INTEGER;

-- Fusión: los diarios de la misma empresa, banco, moneda y sucursales (no efectivo) pasan a
-- ser una sola cuenta. Queda el activo de id menor; los demás le pasan sus movimientos,
-- arqueos y métodos y quedan inactivos como "(fusionado)". Igual que la migración del repo.
DO $$
DECLARE
  g      RECORD;
  queda  INTEGER;
  viejo  INTEGER;
  i      INTEGER;
BEGIN
  FOR g IN
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
  LOOP
    queda := g.ids[1];
    FOR i IN 2 .. array_length(g.ids, 1) LOOP
      viejo := g.ids[i];
      UPDATE payments          SET payment_journal_id = queda WHERE payment_journal_id = viejo;
      UPDATE payments          SET change_journal_id  = queda WHERE change_journal_id  = viejo;
      UPDATE expenses          SET payment_journal_id = queda WHERE payment_journal_id = viejo;
      UPDATE incomes           SET payment_journal_id = queda WHERE payment_journal_id = viejo;
      UPDATE purchase_payments SET payment_journal_id = queda WHERE payment_journal_id = viejo;
      UPDATE sales             SET payment_journal_id = queda WHERE payment_journal_id = viejo;

      -- Arqueo: si la sesión tenía las dos cajas, las cifras se suman en la que queda.
      UPDATE cash_session_journals s
         SET opening_amount  = COALESCE(s.opening_amount, 0)  + COALESCE(v.opening_amount, 0),
             expected_amount = CASE WHEN s.expected_amount IS NULL AND v.expected_amount IS NULL THEN NULL
                                    ELSE COALESCE(s.expected_amount, 0) + COALESCE(v.expected_amount, 0) END,
             closing_amount  = CASE WHEN s.closing_amount IS NULL AND v.closing_amount IS NULL THEN NULL
                                    ELSE COALESCE(s.closing_amount, 0) + COALESCE(v.closing_amount, 0) END,
             difference      = CASE WHEN s.difference IS NULL AND v.difference IS NULL THEN NULL
                                    ELSE COALESCE(s.difference, 0) + COALESCE(v.difference, 0) END
        FROM cash_session_journals v
       WHERE s.journal_id = queda AND v.journal_id = viejo AND v.session_id = s.session_id;
      DELETE FROM cash_session_journals v
       WHERE v.journal_id = viejo
         AND EXISTS (SELECT 1 FROM cash_session_journals s WHERE s.journal_id = queda AND s.session_id = v.session_id);
      UPDATE cash_session_journals SET journal_id = queda WHERE journal_id = viejo;

      -- Los métodos de la absorbida pasan a la cuenta; si se repiten, vale el sentido más amplio.
      INSERT INTO payment_journal_methods (journal_id, company_id, method_code, allows_inflow, allows_outflow, sort_order)
      SELECT queda, company_id, method_code, allows_inflow, allows_outflow,
             (SELECT COUNT(*) FROM payment_journal_methods WHERE journal_id = queda)
        FROM payment_journal_methods WHERE journal_id = viejo
      ON CONFLICT (journal_id, method_code) DO UPDATE
         SET allows_inflow  = payment_journal_methods.allows_inflow  OR EXCLUDED.allows_inflow,
             allows_outflow = payment_journal_methods.allows_outflow OR EXCLUDED.allows_outflow;

      UPDATE payment_journals
         SET active = false, merged_into_id = queda, name = LEFT(name, 186) || ' (fusionado)'
       WHERE id = viejo;
    END LOOP;

    -- La cuenta toma el nombre del banco.
    UPDATE payment_journals pj SET name = b.name, active = g.alguno_activo
      FROM banks b WHERE pj.id = queda AND b.id = pj.bank_id;
    RAISE NOTICE 'empresa %: diarios % fusionados en %', g.company_id, g.ids[2:], queda;
  END LOOP;
END $$;

-- Conciliación por cuenta (diario).
ALTER TABLE bank_statements ADD COLUMN journal_id INTEGER REFERENCES payment_journals(id) ON DELETE SET NULL;
UPDATE bank_statements st SET journal_id = (
  SELECT pj.id FROM payment_journals pj
   WHERE pj.company_id = st.company_id AND pj.bank_id = st.bank_id
     AND pj.currency_id IS NOT DISTINCT FROM st.currency_id
     AND pj.merged_into_id IS NULL AND COALESCE(pj.type, '') <> 'efectivo'
   ORDER BY (EXISTS (SELECT 1 FROM payment_journal_warehouses w
                      WHERE w.journal_id = pj.id AND w.warehouse_id = st.warehouse_id)) DESC,
            pj.active DESC, pj.id
   LIMIT 1);
CREATE INDEX bank_statements_journal_idx ON bank_statements (journal_id);

-- El sentido vive ahora en cada método de la cuenta.
ALTER TABLE payment_journals DROP COLUMN allows_inflow;
ALTER TABLE payment_journals DROP COLUMN allows_outflow;

-- ── 5. 20261009100000-reconciliation-grouped-charges ───────────────────────────────────
DROP INDEX IF EXISTS bank_reconciliation_matches_source_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_document_key
    ON bank_reconciliation_matches (source_type, source_id)
 WHERE role = 'documento';
CREATE INDEX IF NOT EXISTS bank_reconciliation_matches_source_idx ON bank_reconciliation_matches (source_type, source_id);

-- ── RLS (Supabase: activo sin políticas en todo public) ────────────────────────────────
ALTER TABLE bank_statements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_journal_methods     ENABLE ROW LEVEL SECURITY;

-- ── Registro: un db:migrate futuro no las vuelve a correr ──────────────────────────────
INSERT INTO "SequelizeMeta" (name) VALUES
  ('20260915100000-increase-discount-precision.js'),
  ('20261006100000-bank-reconciliation.js'),
  ('20261006120000-journal-direction.js'),
  ('20261006140000-journal-accounts.js'),
  ('20261009100000-reconciliation-grouped-charges.js')
ON CONFLICT DO NOTHING;

COMMIT;

-- Resultado: cuentas fusionadas por empresa (tiene que coincidir con la vista previa).
SELECT c.name AS empresa, q.name AS cuenta, string_agg(v.name, ' · ' ORDER BY v.id) AS absorbidos
  FROM payment_journals v
  JOIN payment_journals q ON q.id = v.merged_into_id
  JOIN companies c ON c.id = q.company_id
 GROUP BY c.name, q.id, q.name
 ORDER BY c.name, q.name;
