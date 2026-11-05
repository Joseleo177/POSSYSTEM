-- Avisos al teléfono del cliente: "Tu pedido está listo" (migración 20261111100000-avisos-push.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: la cocina consulta esta
-- tabla al marcar una ronda como lista. Es idempotente.
--
-- Además, en Vercel (proyecto del backend) hay que cargar tres variables de entorno:
--   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (ej. mailto:soporte@tudominio.com).
-- Sin ellas los avisos quedan apagados aunque la empresa los encienda.

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        VARCHAR(200) NOT NULL,
  auth          VARCHAR(100) NOT NULL,
  device_hash   VARCHAR(64),
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  table_id      INTEGER,
  table_at      TIMESTAMPTZ,
  fails         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ok_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_direccion ON push_subscriptions (company_id, endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_mesa ON push_subscriptions (company_id, table_id, table_at);
CREATE INDEX IF NOT EXISTS push_subscriptions_aparato ON push_subscriptions (company_id, device_hash) WHERE device_hash IS NOT NULL;
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261111100000-avisos-push.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261111100000-avisos-push.js');

COMMIT;

-- Verificación final: debe devolver UNA fila.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'push_subscriptions';
