-- Mapa de mesas (migración 20261031110000-mesas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-cocina.sql. Es idempotente: se puede correr dos veces sin daño.
--
-- El módulo va con el interruptor «Restaurante» de Empresas (companies.cocina_enabled).

BEGIN;

CREATE TABLE IF NOT EXISTS dining_areas (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  name         VARCHAR(60) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dining_areas_company_warehouse ON dining_areas (company_id, warehouse_id);
-- Como todo el esquema public: RLS activo sin políticas (el backend entra con su rol).
ALTER TABLE dining_areas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS dining_tables (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER,
  area_id      INTEGER NOT NULL REFERENCES dining_areas(id),
  name         VARCHAR(20) NOT NULL,
  seats        INTEGER NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 99),
  shape        VARCHAR(10) NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'rect')),
  x            INTEGER NOT NULL DEFAULT 0 CHECK (x BETWEEN 0 AND 39),
  y            INTEGER NOT NULL DEFAULT 0 CHECK (y BETWEEN 0 AND 23),
  w            INTEGER NOT NULL DEFAULT 4 CHECK (w BETWEEN 2 AND 12),
  h            INTEGER NOT NULL DEFAULT 4 CHECK (h BETWEEN 2 AND 12),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dining_tables_area ON dining_tables (area_id);
CREATE INDEX IF NOT EXISTS dining_tables_company ON dining_tables (company_id);
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS waiter_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

-- Ver el mapa, para quien ya cobraba.
UPDATE roles
   SET permissions = permissions || '{"tables.view": true}'::jsonb
 WHERE ((permissions->>'sales.create') = 'true' OR (permissions->>'sales') = 'true')
   AND (permissions->>'tables.view') IS NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031110000-mesas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031110000-mesas.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('dining_areas', 'warehouse_id'), ('dining_tables', 'area_id'),
    ('sales', 'table_id'), ('sales', 'waiter_id')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
