-- Pedido por puesto (migración 20261121100000-pedido-por-puesto.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: los modelos SaleItem y
-- KitchenTicketItem leen estas columnas. Sin ellas fallan la caja, las mesas y la cocina.
-- Es idempotente.

BEGIN;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS seat SMALLINT;
ALTER TABLE kitchen_ticket_items ADD COLUMN IF NOT EXISTS seat SMALLINT;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261121100000-pedido-por-puesto.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261121100000-pedido-por-puesto.js');

-- Encenderlo solo para el restaurante que pide por puesto (cambiar el id):
-- INSERT INTO settings (key, value, company_id) VALUES ('mesa_por_puesto', 'true', 0000)
--   ON CONFLICT (key, company_id) DO UPDATE SET value = EXCLUDED.value;
-- (o desde Configuración → Punto de venta → Cocina → "Pedir por puesto").

COMMIT;
