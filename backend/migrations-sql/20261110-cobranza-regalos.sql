-- Regalos de la cobranza (migración 20261110100000-cobranza-regalos.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: la ficha del cliente de la
-- Cobranza lee cobranza_regalos. Es idempotente. Requiere 20261109-cobranza-sectores.sql antes.

BEGIN;
CREATE TABLE IF NOT EXISTS cobranza_regalos (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id      INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  qty          NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (qty > 0),
  status       VARCHAR(15) NOT NULL DEFAULT 'por_entregar'
               CHECK (status IN ('por_entregar', 'entregado', 'anulado')),
  notes        TEXT,
  assigned_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  voided_by    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  voided_at    TIMESTAMPTZ,
  void_reason  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cobranza_regalos_number ON cobranza_regalos (company_id, number);
CREATE INDEX IF NOT EXISTS cobranza_regalos_customer ON cobranza_regalos (customer_id);
CREATE INDEX IF NOT EXISTS cobranza_regalos_pending
  ON cobranza_regalos (company_id, warehouse_id, product_id) WHERE status = 'por_entregar';
CREATE INDEX IF NOT EXISTS cobranza_regalos_sale ON cobranza_regalos (sale_id) WHERE sale_id IS NOT NULL;

-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE cobranza_regalos ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261110100000-cobranza-regalos.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261110100000-cobranza-regalos.js');

COMMIT;

-- Verificación: una fila con rowsecurity = true.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cobranza_regalos';
