-- Avances de efectivo (migraciones 20261029100000-avances-efectivo.js y
-- 20261029110000-avance-con-pago.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261028-cobro-tasa-divisas.sql. Es idempotente: se puede correr dos veces sin daño.
--
-- La opción se enciende por empresa en Configuración → Punto de venta, y el permiso
-- «Dar avances de efectivo» se da desde Roles (de entrada solo lo tiene el administrador).

BEGIN;

CREATE TABLE IF NOT EXISTS cash_advances (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER,
  warehouse_id    INTEGER,
  employee_id     INTEGER,
  customer_id     INTEGER,
  sale_id         INTEGER,
  payment_id      INTEGER,
  cash_amount     DECIMAL(14, 2) NOT NULL,
  cash_journal_id INTEGER NOT NULL,
  fee_pct         DECIMAL(7, 3) NOT NULL DEFAULT 0,
  in_amount       DECIMAL(14, 2) NOT NULL,
  fee_amount      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  in_journal_id   INTEGER NOT NULL,
  in_method       VARCHAR(30),
  reference       VARCHAR(50),
  status          VARCHAR(20) NOT NULL DEFAULT 'activo',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cash_advances_company_id_created_at ON cash_advances (company_id, created_at);
-- Como todo el esquema public: RLS activo sin políticas (el backend entra con su rol).
ALTER TABLE cash_advances ENABLE ROW LEVEL SECURITY;

ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS payment_id INTEGER;
ALTER TABLE incomes  ADD COLUMN IF NOT EXISTS cash_advance_id INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cash_advance_id INTEGER;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261029100000-avances-efectivo.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261029100000-avances-efectivo.js');

INSERT INTO "SequelizeMeta" (name)
SELECT '20261029110000-avance-con-pago.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261029110000-avance-con-pago.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('cash_advances', 'in_amount'), ('cash_advances', 'payment_id'),
    ('incomes', 'cash_advance_id'), ('expenses', 'cash_advance_id')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
