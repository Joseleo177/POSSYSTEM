-- Venta al mayor, fases 2 y 3 (migraciones 20261119100000-venta-al-mayor.js y
-- 20261119110000-venta-al-mayor-lineas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: los modelos Company,
-- Product, ProductStock, Customer y SaleItem leen estas columnas. Sin ellas falla el inicio de sesión,
-- la caja y cualquier consulta de productos o clientes.
-- Es idempotente.

BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS mayor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty DECIMAL(10,3);
ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(14,5);
ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS wholesale_min_qty DECIMAL(10,3);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_level VARCHAR(10) NOT NULL DEFAULT 'detal';
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS wholesale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS list_price DECIMAL(14,5);

INSERT INTO "SequelizeMeta" (name)
SELECT n FROM (VALUES ('20261119100000-venta-al-mayor.js'), ('20261119110000-venta-al-mayor-lineas.js')) v(n)
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = v.n);

-- Encenderlo solo para la empresa que vende al mayor (cambiar el id):
-- UPDATE companies SET mayor_enabled = true WHERE id = 0000;
-- OJO: desde este despliegue el precio al mayor (ficha, Excel y catálogo PDF) solo aparece con
-- "Venta al mayor" encendido. Las empresas que ya usaban el catálogo PDF con precios al mayor
-- (Vintage Beauty) necesitan encenderlo para seguir viéndolos. Su caja no cambia mientras no
-- carguen "al mayor desde" ni marquen clientes mayoristas.

COMMIT;
