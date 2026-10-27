-- Adicionales de los platos (migración 20261031130000-adicionales.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-comandas.sql. Es idempotente: se puede correr dos veces sin daño.

BEGIN;

CREATE TABLE IF NOT EXISTS modifier_groups (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER,
  name        VARCHAR(60) NOT NULL,
  min_select  INTEGER NOT NULL DEFAULT 0 CHECK (min_select BETWEEN 0 AND 20),
  max_select  INTEGER CHECK (max_select IS NULL OR max_select BETWEEN 1 AND 20),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS modifier_groups_company ON modifier_groups (company_id);
-- Como todo el esquema public: RLS activo sin políticas (el backend entra con su rol).
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS modifier_options (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER,
  group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name        VARCHAR(60) NOT NULL,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS modifier_options_group ON modifier_options (group_id);
ALTER TABLE modifier_options ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  company_id  INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);
CREATE INDEX IF NOT EXISTS product_modifier_groups_group ON product_modifier_groups (group_id);
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kitchen_ticket_items ADD COLUMN IF NOT EXISTS modifiers VARCHAR(400);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031130000-adicionales.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031130000-adicionales.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('modifier_groups', 'max_select'), ('modifier_options', 'product_id'),
    ('product_modifier_groups', 'group_id'), ('products', 'is_addon'),
    ('kitchen_ticket_items', 'modifiers')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
