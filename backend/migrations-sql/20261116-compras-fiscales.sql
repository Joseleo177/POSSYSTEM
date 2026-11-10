-- Compras y gastos fiscales: factura del proveedor, IVA por línea, otros cargos, factura de servicios
-- y Libro de compras (migraciones 20261116100000-compras-fiscales.js y 20261116110000-compras-
-- servicios.js). Correr en el editor SQL de Supabase ANTES de
-- desplegar el backend: los modelos Purchase, PurchaseItem y Expense leen estas columnas y sin ellas
-- fallan compras y egresos. Es idempotente.

BEGIN;

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS fiscal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_rif VARCHAR(20);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(40);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_control_number VARCHAR(40);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS iva_amount NUMERIC(14, 6) NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS iva_adjust NUMERIC(14, 6) NOT NULL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);

CREATE TABLE IF NOT EXISTS purchase_charges (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  purchase_id         INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  description         VARCHAR(200) NOT NULL,
  amount              NUMERIC(14, 6) NOT NULL,
  iva_rate            NUMERIC(5, 2),
  expense_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchase_charges_purchase ON purchase_charges (purchase_id);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE purchase_charges ENABLE ROW LEVEL SECURITY;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fiscal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_rif VARCHAR(20);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS control_number VARCHAR(40);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS iva_amount NUMERIC(14, 6) NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(14, 2);

-- Factura de servicios: compra sin mercancía, solo con líneas de gasto.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'mercancia';

INSERT INTO "SequelizeMeta" (name)
SELECT '20261116100000-compras-fiscales.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261116100000-compras-fiscales.js');
INSERT INTO "SequelizeMeta" (name)
SELECT '20261116110000-compras-servicios.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261116110000-compras-servicios.js');

COMMIT;

-- Verificación final: debe devolver 19 filas (18 columnas + la tabla nueva).
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'purchases' AND column_name IN ('fiscal', 'supplier_rif', 'supplier_invoice_number',
          'supplier_control_number', 'supplier_invoice_date', 'iva_amount', 'iva_adjust', 'kind'))
     OR (table_name = 'purchase_items' AND column_name = 'iva_rate')
     OR (table_name = 'expenses' AND column_name IN ('fiscal', 'supplier_rif', 'supplier_name', 'invoice_number',
          'control_number', 'invoice_date', 'iva_rate', 'iva_amount', 'invoice_total'))
     OR (table_name = 'purchase_charges' AND column_name = 'id'));
