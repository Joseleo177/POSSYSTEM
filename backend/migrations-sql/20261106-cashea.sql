-- Ventas con Cashea (migración 20261106100000-cashea.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Payment ya lee
-- payments.cashea_settlement_id, y sin la columna fallan TODOS los cobros. Es idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS cashea_settlements (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER,
  journal_id        INTEGER NOT NULL,
  payment_method    VARCHAR(30),
  cashea_journal_id INTEGER NOT NULL,
  sale_count        INTEGER NOT NULL DEFAULT 0,
  owed_amount       DECIMAL(14, 2) NOT NULL,
  received_amount   DECIMAL(14, 2) NOT NULL,
  rate              DECIMAL(14, 6) NOT NULL DEFAULT 1,
  received_base     DECIMAL(14, 2) NOT NULL,
  commission        DECIMAL(14, 2) NOT NULL DEFAULT 0,
  date              DATE NOT NULL,
  reference         VARCHAR(50),
  notes             TEXT,
  employee_id       INTEGER,
  status            VARCHAR(20) NOT NULL DEFAULT 'activo',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cashea_settlements_company_id_date ON cashea_settlements (company_id, date);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE cashea_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashea_settlement_id INTEGER;
ALTER TABLE incomes  ADD COLUMN IF NOT EXISTS cashea_settlement_id INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cashea_settlement_id INTEGER;
CREATE INDEX IF NOT EXISTS payments_cashea_settlement_id ON payments (cashea_settlement_id);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261106100000-cashea.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261106100000-cashea.js');

COMMIT;

-- Verificación final: debe devolver UNA fila con rowsecurity = true, y 3 columnas abajo.
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname = 'public' AND tablename = 'cashea_settlements';
SELECT table_name FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'cashea_settlement_id';
