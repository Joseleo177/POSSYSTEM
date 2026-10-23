-- Descuento por línea en el POS (migración 20261027100000-descuento-por-linea.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa: sin las
-- columnas, cualquier venta falla con "column line_discount_mode does not exist".
-- Es idempotente: se puede correr dos veces sin daño.

BEGIN;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_discount_mode  VARCHAR(10);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_discount_value DECIMAL(14, 5);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_by         INTEGER;

-- Permiso nuevo: se le concede a quien ya podía facturar, para que nadie pierda el descuento
-- global que daba hasta hoy. Alcanza también a las plantillas de rol (company_id NULL).
UPDATE roles
   SET permissions = permissions || '{"sales.discount": true}'::jsonb
 WHERE (permissions->>'sales.create')::boolean IS TRUE
   AND permissions->'sales.discount' IS NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261027100000-descuento-por-linea.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261027100000-descuento-por-linea.js');

-- Red de seguridad: el modelo de compras ya declara esta columna (migración 20260610100000).
-- Debería existir desde junio; si por algo faltara, las compras fallarían al desplegar. Si ya
-- está, no hace nada.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS update_price BOOLEAN NOT NULL DEFAULT true;

COMMIT;

-- Verificación final: columnas que el código desplegado necesita y que NO están en la base.
-- Debe devolver CERO filas. Si devuelve alguna, no despliegues: avisa cuál es.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('sale_items', 'line_discount_mode'), ('sale_items', 'line_discount_value'), ('sale_items', 'discount_by'),
    ('companies', 'fabrica_enabled'),
    ('products', 'piece_mode'), ('products', 'piece_width_mm'), ('products', 'piece_length_mm'),
    ('purchase_items', 'update_price'), ('purchase_items', 'piece_width_mm'), ('purchase_items', 'piece_length_mm'),
    ('material_pieces', 'shape'), ('fabrication_order_pieces', 'layout')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
