-- Pedidos del catálogo con entrega y pago (migración 20261101150000-pedidos-web-entrega-pago.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Sale ya trae las
-- columnas de entrega y sin ellas falla cualquier consulta de ventas. Es idempotente.

BEGIN;

-- Extra por empresa: lo enciende el superusuario en Gestión de Empresas.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedidos_web_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS catalog_visible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS catalog_info JSONB;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment VARCHAR(10);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_km NUMERIC(6,1);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(300);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_reference VARCHAR(200);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9,6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9,6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS extra_charge NUMERIC(14,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS extra_charge_reason VARCHAR(120);

CREATE TABLE IF NOT EXISTS web_order_rejections (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id       INTEGER NOT NULL,
  customer_id   INTEGER,
  reason        VARCHAR(200) NOT NULL,
  total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  items         JSONB,
  ordered_at    TIMESTAMPTZ,
  employee_id   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS web_order_rejections_customer ON web_order_rejections (customer_id, created_at);
ALTER TABLE web_order_rejections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS payment_reports (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id           INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  customer_id       INTEGER,
  journal_id        INTEGER NOT NULL,
  payment_method    VARCHAR(30),
  currency_id       INTEGER,
  amount            NUMERIC(18,2) NOT NULL,
  exchange_rate     NUMERIC(18,6) NOT NULL DEFAULT 1,
  amount_base       NUMERIC(14,6) NOT NULL,
  reference_number  VARCHAR(100) NOT NULL,
  reference_date    DATE NOT NULL,
  payer_bank        VARCHAR(80),
  payer_phone       VARCHAR(30),
  status            VARCHAR(12) NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente', 'confirmado', 'rechazado', 'aplicado')),
  confirmed_via     VARCHAR(10),
  statement_line_id INTEGER,
  payment_id        INTEGER,
  reviewed_by       INTEGER,
  reviewed_at       TIMESTAMPTZ,
  reject_reason     VARCHAR(200),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_reports_sale ON payment_reports (sale_id);
CREATE INDEX IF NOT EXISTS payment_reports_abiertos ON payment_reports (company_id, journal_id) WHERE status IN ('pendiente', 'confirmado');
CREATE UNIQUE INDEX IF NOT EXISTS payment_reports_line ON payment_reports (statement_line_id) WHERE statement_line_id IS NOT NULL AND status <> 'rechazado';
ALTER TABLE payment_reports ENABLE ROW LEVEL SECURITY;

UPDATE roles
   SET permissions = permissions || '{"accounting.confirm": true}'::jsonb
 WHERE (permissions->>'accounting.reconcile')::boolean IS TRUE
   AND permissions->'accounting.confirm' IS NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101150000-pedidos-web-entrega-pago.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101150000-pedidos-web-entrega-pago.js');

COMMIT;

-- Verificación: dos filas con relrowsecurity = true y nueve columnas nuevas en sales.
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('payment_reports', 'web_order_rejections');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'sales' AND column_name IN ('fulfillment', 'delivery_km', 'delivery_address', 'delivery_reference', 'delivery_lat', 'delivery_lng', 'delivery_fee', 'extra_charge', 'extra_charge_reason');
