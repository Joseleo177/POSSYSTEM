-- Pedidos desde el QR de la mesa (migración 20261101140000-pedidos-qr.js). Correr en el editor
-- SQL de Supabase ANTES de desplegar el backend que los usa (el mapa de mesas la consulta).
-- Es idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS table_orders (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_id      INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  warehouse_id  INTEGER NOT NULL,
  items         JSONB NOT NULL,
  summary       VARCHAR(500),
  estimate      NUMERIC(14,2) NOT NULL DEFAULT 0,
  note          VARCHAR(200),
  status        VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aceptado', 'rechazado')),
  reason        VARCHAR(200),
  sale_id       INTEGER,
  ticket_id     INTEGER,
  resolved_by   INTEGER,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS table_orders_mesa ON table_orders (table_id, created_at);
CREATE INDEX IF NOT EXISTS table_orders_pendientes ON table_orders (company_id, warehouse_id) WHERE status = 'pendiente';
ALTER TABLE table_orders ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101140000-pedidos-qr.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101140000-pedidos-qr.js');

COMMIT;

-- Verificación: debe devolver una fila con relrowsecurity = true.
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'table_orders';
