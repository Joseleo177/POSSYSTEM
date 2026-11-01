-- Reconocer al cliente en el QR de la mesa (migración 20261103100000-clientes-mesa.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo de los pedidos
-- del QR (table_orders) ya pide la columna device_hash, y sin ella falla el mapa de mesas y el
-- pedido desde el QR. Es idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS customer_devices (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_hash   VARCHAR(64) NOT NULL,
  confirmed     BOOLEAN NOT NULL DEFAULT false,
  declined      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_devices_aparato ON customer_devices (company_id, device_hash);
CREATE INDEX IF NOT EXISTS customer_devices_cliente ON customer_devices (customer_id);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;

ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS device_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS table_orders_aparato ON table_orders (company_id, device_hash) WHERE device_hash IS NOT NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261103100000-clientes-mesa.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261103100000-clientes-mesa.js');

COMMIT;

-- Verificación final: debe devolver DOS filas (customer_devices.device_hash y table_orders.device_hash).
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND column_name = 'device_hash'
   AND table_name IN ('customer_devices', 'table_orders');
