-- Módulo de Farmacia (migraciones 20261123100000-modulo-farmacia.js y 20261123110000-farmacia-pin-permisos.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: los modelos Company, Product,
-- ProductStock, SaleItem, Employee y SalePrescription leen estas columnas. Sin ellas fallan el
-- inicio de sesión, el inventario y la caja.
-- Es idempotente: se puede volver a correr sin problema.

BEGIN;

-- 1. Bandera del módulo en la empresa
ALTER TABLE companies ADD COLUMN IF NOT EXISTS farmacia_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Ficha farmacéutica en productos
ALTER TABLE products ADD COLUMN IF NOT EXISTS active_ingredient VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS concentration VARCHAR(80);
ALTER TABLE products ADD COLUMN IF NOT EXISTS therapeutic_action VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(60);
ALTER TABLE products ADD COLUMN IF NOT EXISTS prescription_type VARCHAR(20) NOT NULL DEFAULT 'libre';
ALTER TABLE products ADD COLUMN IF NOT EXISTS box_price DECIMAL(14,5);

CREATE INDEX IF NOT EXISTS idx_products_active_ingredient
  ON products (company_id, LOWER(active_ingredient))
  WHERE active_ingredient IS NOT NULL;

-- 3. Precio por caja por sucursal (hereda de products.box_price si es NULL)
ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS box_price DECIMAL(14,5);

-- 4. Factor de stock y etiqueta de presentación en líneas de venta
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS stock_factor DECIMAL(10,3) NOT NULL DEFAULT 1;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_label VARCHAR(40);

-- 5. PIN de autorización farmacéutica en empleados (bcrypt, 4–6 dígitos)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS approval_pin_hash VARCHAR(255);

-- 6. Registro de récipes y psicotrópicos (con foto opcional y trazabilidad de autorización)
CREATE TABLE IF NOT EXISTS sale_prescriptions (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id             INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  patient_name        VARCHAR(150) NOT NULL,
  patient_id_doc      VARCHAR(30) NOT NULL,
  doctor_name         VARCHAR(150) NOT NULL,
  doctor_license      VARCHAR(50),
  prescription_number VARCHAR(60),
  photo_filename      VARCHAR(255),
  prescription_date   DATE,
  notes               TEXT,
  approved_by         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Por si la tabla ya existía sin las columnas de autorización
ALTER TABLE sale_prescriptions ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE sale_prescriptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sale_prescriptions_company_sale
  ON sale_prescriptions (company_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_prescriptions_company_created
  ON sale_prescriptions (company_id, created_at DESC);

ALTER TABLE sale_prescriptions ENABLE ROW LEVEL SECURITY;

-- 7. Registrar ambas migraciones en SequelizeMeta
INSERT INTO "SequelizeMeta" (name)
SELECT '20261123100000-modulo-farmacia.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261123100000-modulo-farmacia.js');

INSERT INTO "SequelizeMeta" (name)
SELECT '20261123110000-farmacia-pin-permisos.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261123110000-farmacia-pin-permisos.js');

COMMIT;

-- Encender el extra en una farmacia (cambiar el id), o desde Gestión de Empresas → Editar → Rubros → Farmacia:
-- UPDATE companies SET farmacia_enabled = true WHERE id = 0000;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('companies', 'farmacia_enabled'),
    ('products', 'active_ingredient'),
    ('products', 'concentration'),
    ('products', 'therapeutic_action'),
    ('products', 'shelf_location'),
    ('products', 'prescription_type'),
    ('products', 'box_price'),
    ('product_stock', 'box_price'),
    ('sale_items', 'stock_factor'),
    ('sale_items', 'unit_label'),
    ('employees', 'approval_pin_hash'),
    ('sale_prescriptions', 'patient_name'),
    ('sale_prescriptions', 'photo_filename'),
    ('sale_prescriptions', 'approved_by'),
    ('sale_prescriptions', 'approved_at')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
