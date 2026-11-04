-- Registro de accesos (migración 20261030100000-login-events.js).
-- Si en Supabase ya está la tabla (el login funciona), esto solo la deja registrada en
-- SequelizeMeta y con RLS. Es idempotente: no borra ni repite nada.

BEGIN;

CREATE TABLE IF NOT EXISTS login_events (
  id          SERIAL       PRIMARY KEY,
  company_id  INTEGER,
  employee_id INTEGER      REFERENCES employees(id) ON DELETE SET NULL,
  username    VARCHAR(100),
  kind        VARCHAR(20)  NOT NULL,
  result      VARCHAR(20)  NOT NULL,
  ip          VARCHAR(60),
  user_agent  VARCHAR(300),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_events_employee ON login_events(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_company  ON login_events(company_id, created_at DESC);
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261030100000-login-events.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261030100000-login-events.js');

COMMIT;
