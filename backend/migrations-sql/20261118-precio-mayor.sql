-- Catálogo PDF al mayor (migraciones 20261118100000-precio-mayor.js y
-- 20261118110000-catalogo-pdf.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Product lee
-- wholesale_price y net_content, y Company lee catalogo_pdf_enabled. Sin las columnas falla
-- cualquier consulta de productos (la caja, el catálogo, la vitrina) y el inicio de sesión.
-- Es idempotente.

BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(14,5);
ALTER TABLE products ADD COLUMN IF NOT EXISTS net_content VARCHAR(30);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS catalogo_pdf_enabled BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "SequelizeMeta" (name)
SELECT n FROM (VALUES ('20261118100000-precio-mayor.js'), ('20261118110000-catalogo-pdf.js')) v(n)
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = v.n);

-- Encenderlo solo para la empresa que lo contrató (cambiar el id):
-- UPDATE companies SET catalogo_pdf_enabled = true WHERE id = 0000;

COMMIT;
