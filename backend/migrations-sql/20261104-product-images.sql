-- Varias fotos por producto (migración 20261104100000-product-images.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: la ficha pública del
-- producto (/catalogo/<tienda>/p/<id>) y el borrado de productos ya leen esta tabla, y sin ella
-- los dos fallan. Es idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS product_images (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_filename VARCHAR(255) NOT NULL,
  label          VARCHAR(60),
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_images_producto ON product_images (product_id, position);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261104100000-product-images.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261104100000-product-images.js');

COMMIT;

-- Verificación final: debe devolver UNA fila con rowsecurity = true.
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname = 'public' AND tablename = 'product_images';
