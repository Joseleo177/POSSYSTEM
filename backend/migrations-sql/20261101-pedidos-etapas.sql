-- Etapas del pedido web y productos de cocina (migración 20261101160000-pedidos-etapas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa: los modelos
-- Product y Sale traen las columnas nuevas, y sin ellas falla cualquier consulta de productos
-- o ventas. Es idempotente: se puede correr dos veces sin daño.

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS kitchen_prep BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(12);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment_status_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Las empresas que ya tenían cocina siguen igual: todo lo vendible (menos los adicionales)
-- queda marcado como "se prepara en cocina" hasta que desmarquen lo que no.
UPDATE products p SET kitchen_prep = true
  FROM companies c
 WHERE c.id = p.company_id AND c.cocina_enabled AND NOT p.is_addon AND NOT p.kitchen_prep;

-- Los pedidos web ya aceptados quedan como entregados: si no, "En curso" arrancaría lleno.
UPDATE sales SET fulfillment_status = 'entregado', fulfillment_status_at = NOW()
 WHERE web_customer_name IS NOT NULL AND status <> 'pedido' AND fulfillment_status IS NULL;

-- Sin CONCURRENTLY: el editor envuelve todo en una transacción. La tabla de ventas se bloquea
-- unos instantes mientras se arma; correrlo fuera del horario de ventas.
CREATE INDEX IF NOT EXISTS sales_pedidos_en_curso
    ON sales (company_id, created_at)
 WHERE web_customer_name IS NOT NULL AND fulfillment_status IN ('aceptado', 'listo', 'en_camino');

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101160000-pedidos-etapas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101160000-pedidos-etapas.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('products', 'kitchen_prep'), ('sales', 'fulfillment_status'),
    ('sales', 'fulfillment_status_at'), ('sales', 'delivered_at')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
