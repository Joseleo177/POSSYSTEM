-- Equivalente SQL de src/migrations/20261006100000-bank-reconciliation.js
--
-- ALTERNATIVA MANUAL. En el despliegue de octubre 2026 las migraciones se corren con db:migrate
-- (ver DESPLIEGUE-2026-10.md), que ya aplica esta. No correr las dos.
--
-- El backend en Vercel no corre `db:migrate`, así que en la nube esta migración se aplica a
-- mano desde el editor SQL de Supabase, ANTES de desplegar el backend que la usa. El INSERT
-- final en "SequelizeMeta" es parte de la migración: sin él, un despliegue que sí corra las
-- migraciones intentará aplicarla de nuevo.
--
-- Las tres tablas nuevas llevan RLS activo sin políticas, como todo `public` en Supabase: el
-- backend entra como dueño y no le afecta; la API pública queda cerrada.

BEGIN;

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
CREATE UNIQUE INDEX IF NOT EXISTS bank_reconciliation_matches_source_key ON bank_reconciliation_matches (source_type, source_id);
CREATE INDEX        IF NOT EXISTS bank_reconciliation_matches_line_idx   ON bank_reconciliation_matches (line_id);

ALTER TABLE bank_statements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;

-- Permiso nuevo: se le concede a cada rol que ya registraba egresos (incluye las plantillas).
UPDATE roles
   SET permissions = permissions || '{"accounting.reconcile": true}'::jsonb
 WHERE (permissions->>'accounting.expense')::boolean IS TRUE
   AND permissions->'accounting.reconcile' IS NULL;

INSERT INTO "SequelizeMeta" (name) VALUES ('20261006100000-bank-reconciliation.js')
ON CONFLICT DO NOTHING;

COMMIT;
