-- ══════════════════════════════════════
--  Migración: Imágenes de productos
-- ══════════════════════════════════════
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);
