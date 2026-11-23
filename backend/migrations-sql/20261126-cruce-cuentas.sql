-- Cruce de cuentas con proveedores (migración 20261126100000-cruce-cuentas.js).
--
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Customer declara
-- los índices únicos por (rif, company_id, type) y la ficha del contacto consulta
-- cruces_cuentas. Es idempotente.
--
-- Qué cambia:
--  1. El mismo RIF (y el mismo correo) puede tener ficha de cliente Y de proveedor en la misma
--     empresa. Sigue sin poder haber dos clientes (o dos proveedores) con el mismo RIF.
--  2. Tabla cruces_cuentas. Los pagos del cruce van sin caja (payment_journal_id NULL, método
--     'cruce', batch_id 'cruce:<id>'): no tocan arqueo ni Ingresos y egresos.
--  3. Permiso nuevo customers.cross ("Cruzar cuentas con proveedores"): no requiere SQL; de
--     entrada solo lo tiene el administrador (permissions.all).

BEGIN;

-- Quita los únicos viejos por (rif, company_id) y (email, company_id), se llamen como se llamen.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname AS nombre, 'constraint' AS clase
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'customers' AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k)
           IN (ARRAY['company_id','rif'], ARRAY['company_id','email'])
  LOOP
    EXECUTE format('ALTER TABLE customers DROP CONSTRAINT %I', r.nombre);
  END LOOP;

  FOR r IN
    SELECT i.relname AS nombre
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
     WHERE t.relname = 'customers' AND x.indisunique AND NOT x.indisprimary
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM unnest(x.indkey) k JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k)
           IN (ARRAY['company_id','rif'], ARRAY['company_id','email'])
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.nombre);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_rif_company_type_unique   ON customers (rif, company_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_company_type_unique ON customers (email, company_id, type);

CREATE TABLE IF NOT EXISTS cruces_cuentas (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proveedor_id  INTEGER NOT NULL REFERENCES customers(id),
  cliente_id    INTEGER NOT NULL REFERENCES customers(id),
  monto         NUMERIC(14, 2) NOT NULL,
  notas         TEXT,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  estado        VARCHAR(10) NOT NULL DEFAULT 'activo',
  anulado_por   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  anulado_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cruces_cuentas_proveedor ON cruces_cuentas (company_id, proveedor_id);
ALTER TABLE cruces_cuentas ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261126100000-cruce-cuentas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261126100000-cruce-cuentas.js');

COMMIT;

-- Verificación: los únicos de customers deben ser el id y los dos nuevos (con type).
SELECT i.relname AS indice, pg_get_indexdef(x.indexrelid) AS definicion
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
 WHERE t.relname = 'customers' AND x.indisunique;
