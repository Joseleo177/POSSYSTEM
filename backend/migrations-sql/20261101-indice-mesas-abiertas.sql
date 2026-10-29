-- Índice parcial de cuentas abiertas por mesa (migración 20261101130000-indice-mesas-abiertas.js).
-- Correr en el editor SQL de Supabase. No hace falta antes del deploy (sin él todo funciona,
-- solo más lento), pero conviene ponerlo ya: el QR de las mesas lo consulta cada 15 s.
-- Es pequeño (solo las cuentas abiertas): se crea al instante, sin CONCURRENTLY.

BEGIN;

CREATE INDEX IF NOT EXISTS sales_mesa_abiertas ON sales (table_id)
 WHERE table_id IS NOT NULL AND status IN ('espera', 'borrador', 'pedido');

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101130000-indice-mesas-abiertas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101130000-indice-mesas-abiertas.js');

COMMIT;

-- Verificación: debe devolver una fila.
SELECT indexname FROM pg_indexes WHERE tablename = 'sales' AND indexname = 'sales_mesa_abiertas';
