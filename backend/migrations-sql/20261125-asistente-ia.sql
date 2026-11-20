-- Despliegue del 25-11: CUATRO migraciones en un solo pegado.
--   20261125100000-asistente-ia.js           companies.asistente_* + asistente_mensajes
--   20261125100000-must-change-password.js   employees.must_change_password
--   20261125110000-plataforma-ajustes.js     plataforma_ajustes
--   20261125110000-token-version.js          employees.token_version
--
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Company lee
-- asistente_enabled, asistente_plan y asistente_limite, y el modelo Employee lee
-- must_change_password y token_version. Sin las columnas falla el inicio de sesión y cualquier
-- consulta de la empresa o del empleado. Es idempotente.
--
-- token_version entra en 0 para todos y los tokens viejos sin versión se toman como 0: el deploy
-- no saca a nadie. must_change_password entra en false; se marca solo al iniciar sesión con una
-- contraseña que no cumple la regla.
--
-- La llave de DeepSeek NO va en Vercel: se pega después del deploy en Configuración →
-- Asistente IA (superusuario) y se guarda cifrada en plataforma_ajustes. Opcionales en el
-- entorno: los precios por millón de tokens DEEPSEEK_PRECIO_ENTRADA, DEEPSEEK_PRECIO_CACHE y
-- DEEPSEEK_PRECIO_SALIDA (solo para calcular el costo guardado).

BEGIN;

-- 20261125100000-asistente-ia.js
ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_plan VARCHAR(10) NOT NULL DEFAULT 'basico';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_limite INTEGER;

CREATE TABLE IF NOT EXISTS asistente_mensajes (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  pregunta        TEXT NOT NULL,
  respuesta       TEXT,
  herramientas    JSONB NOT NULL DEFAULT '[]',
  tokens_cache    INTEGER NOT NULL DEFAULT 0,
  tokens_entrada  INTEGER NOT NULL DEFAULT 0,
  tokens_salida   INTEGER NOT NULL DEFAULT 0,
  costo_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  duracion_ms     INTEGER,
  error           VARCHAR(300),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asistente_mensajes_empresa ON asistente_mensajes (company_id, created_at);
ALTER TABLE asistente_mensajes ENABLE ROW LEVEL SECURITY;

-- 20261125100000-must-change-password.js
ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- 20261125110000-plataforma-ajustes.js
-- Ajustes de la plataforma (no de una empresa): la llave del asistente, cifrada.
CREATE TABLE IF NOT EXISTS plataforma_ajustes (
  clave       VARCHAR(100) PRIMARY KEY,
  valor       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE plataforma_ajustes ENABLE ROW LEVEL SECURITY;

-- 20261125110000-token-version.js
ALTER TABLE employees ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

INSERT INTO "SequelizeMeta" (name)
SELECT n FROM (VALUES
  ('20261125100000-asistente-ia.js'),
  ('20261125100000-must-change-password.js'),
  ('20261125110000-plataforma-ajustes.js'),
  ('20261125110000-token-version.js')
) v(n)
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = v.n);

COMMIT;

-- Encender el extra (cambiar el id), o desde Empresas → editar → Asistente con IA:
-- UPDATE companies SET asistente_enabled = true, asistente_plan = 'basico' WHERE id = 0000;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('companies', 'asistente_enabled'), ('companies', 'asistente_plan'), ('companies', 'asistente_limite'),
    ('asistente_mensajes', 'costo_usd'), ('plataforma_ajustes', 'valor'),
    ('employees', 'must_change_password'), ('employees', 'token_version')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
