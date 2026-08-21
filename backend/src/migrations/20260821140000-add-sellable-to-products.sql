-- Equivalente SQL de la migración 20260821140000-add-sellable-to-products.js
--
-- El backend en Vercel no ejecuta `db:migrate`, así que en Supabase esto se aplica a mano y
-- se registra en SequelizeMeta para que la instalación local y la nube no se desincronicen.
--
-- QUÉ HACE: marca qué productos se pueden vender. Un insumo de cocina —harina, aceite, carne
-- cruda— entra por compras y se descuenta al armar un plato, pero no debe poder cobrarse en
-- caja ni publicarse en el catálogo. Con sellable = false el POS lo oculta, la venta lo
-- rechaza y el catálogo público no lo muestra; el inventario, las compras y las
-- transferencias lo siguen tratando igual que a cualquier otro producto.
--
-- Sin riesgo: todos los productos existentes quedan vendibles, igual que hasta ahora.


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 · Agregar la marca
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sellable BOOLEAN NOT NULL DEFAULT true;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 · Registrar la migración
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "SequelizeMeta" (name)
VALUES ('20260821140000-add-sellable-to-products.js')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────────
SELECT sellable, count(*) FROM products GROUP BY sellable;


-- ─────────────────────────────────────────────────────────────────────────────
-- MARCAR INSUMOS (opcional, se hace desde la ficha del producto)
--
-- Un insumo nunca puede estar publicado, así que se apaga también esa marca.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE products SET sellable = false, visible_in_catalog = false
--  WHERE name IN ('Harina', 'Aceite');


-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSIÓN (solo si hiciera falta deshacer)
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE products DROP COLUMN IF EXISTS sellable;
-- DELETE FROM "SequelizeMeta" WHERE name = '20260821140000-add-sellable-to-products.js';