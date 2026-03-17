-- ══════════════════════════════════════════════════════════════
--  Migración: Compras, paquetes y costo de productos
-- ══════════════════════════════════════════════════════════════

-- ── Columnas adicionales en productos ───────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price    NUMERIC(10,2) DEFAULT NULL,   -- costo unitario
  ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(5,2)  DEFAULT NULL,   -- % margen de ganancia
  ADD COLUMN IF NOT EXISTS package_size  NUMERIC(10,3) DEFAULT NULL,   -- unidades por paquete
  ADD COLUMN IF NOT EXISTS package_unit  VARCHAR(50)   DEFAULT NULL;   -- nombre del paquete (caja, bulto…)

-- ── Recibos de compra (cabecera) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id            SERIAL PRIMARY KEY,
  supplier_id   INTEGER        REFERENCES customers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(200),
  notes         TEXT,
  total         NUMERIC(10,2)  NOT NULL DEFAULT 0,
  employee_id   INTEGER        REFERENCES employees(id) ON DELETE SET NULL,
  warehouse_id  INTEGER        REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── Líneas de recibo de compra ───────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_items (
  id             SERIAL PRIMARY KEY,
  purchase_id    INTEGER        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id     INTEGER        REFERENCES products(id) ON DELETE SET NULL,
  product_name   VARCHAR(200)   NOT NULL,
  package_unit   VARCHAR(50)    NOT NULL DEFAULT 'unidad',
  package_qty    NUMERIC(10,3)  NOT NULL DEFAULT 1,   -- cuántos paquetes comprados
  package_size   NUMERIC(10,3)  NOT NULL DEFAULT 1,   -- unidades por paquete
  package_price  NUMERIC(10,2)  NOT NULL,             -- precio por paquete
  unit_cost      NUMERIC(10,2)  NOT NULL,             -- package_price / package_size
  profit_margin  NUMERIC(5,2)   NOT NULL DEFAULT 0,   -- % margen de ganancia
  sale_price     NUMERIC(10,2)  NOT NULL,             -- unit_cost * (1 + profit_margin/100)
  total_units    NUMERIC(10,3)  NOT NULL,             -- package_qty * package_size
  subtotal       NUMERIC(10,2)  NOT NULL              -- package_qty * package_price
);

-- ── Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchases_created_at     ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase  ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_employee       ON purchases(employee_id);
