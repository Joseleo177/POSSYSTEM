-- ══════════════════════════════════════════════════════════════
--  MIGRACIÓN: Sistema Multi-Inventario
--  Ejecutar UNA sola vez sobre la BD existente
--  Orden: 1) tablas nuevas  2) migración de datos  3) índices
-- ══════════════════════════════════════════════════════════════

-- ── 1. Almacenes / Inventarios ────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. Stock por (producto × almacén) ────────────────────────
CREATE TABLE IF NOT EXISTS product_stock (
  warehouse_id INTEGER        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id   INTEGER        NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  qty          NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (warehouse_id, product_id)
);

-- ── 3. Transferencias entre almacenes ────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                SERIAL         PRIMARY KEY,
  from_warehouse_id INTEGER        REFERENCES warehouses(id) ON DELETE SET NULL,
  to_warehouse_id   INTEGER        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id        INTEGER        REFERENCES products(id) ON DELETE SET NULL,
  product_name      VARCHAR(200)   NOT NULL,
  qty               NUMERIC(10, 3) NOT NULL CHECK (qty > 0),
  note              TEXT,
  employee_id       INTEGER        REFERENCES employees(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── 4. Empleado ↔ Almacén (qué cajero trabaja en qué almacén) ─
CREATE TABLE IF NOT EXISTS employee_warehouses (
  employee_id  INTEGER NOT NULL REFERENCES employees(id)  ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, warehouse_id)
);

-- ── 5. Columna warehouse_id en ventas y compras ───────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════════
--  MIGRACIÓN DE DATOS
--  Crea el almacén "Principal" y migra el stock actual
-- ══════════════════════════════════════════════════════════════

-- Insertar almacén por defecto
INSERT INTO warehouses (name, description, sort_order)
VALUES ('Principal', 'Almacén principal (migrado automáticamente)', 0)
ON CONFLICT (name) DO NOTHING;

-- Migrar stock actual de cada producto al almacén Principal
INSERT INTO product_stock (warehouse_id, product_id, qty)
SELECT
  (SELECT id FROM warehouses WHERE name = 'Principal'),
  p.id,
  p.stock
FROM products p
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- Asignar todos los empleados actuales al almacén Principal
INSERT INTO employee_warehouses (employee_id, warehouse_id)
SELECT
  e.id,
  (SELECT id FROM warehouses WHERE name = 'Principal')
FROM employees e
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
--  ÍNDICES
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_product_stock_product   ON product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_warehouse ON product_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_product       ON stock_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from          ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to            ON stock_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_created_at    ON stock_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emp_warehouses_emp      ON employee_warehouses(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_warehouse         ON sales(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchases_warehouse     ON purchases(warehouse_id);

-- ══════════════════════════════════════════════════════════════
--  VERIFICACIÓN (ejecuta esto después para confirmar)
-- ══════════════════════════════════════════════════════════════
-- SELECT w.name, COUNT(ps.product_id) AS productos, SUM(ps.qty) AS stock_total
-- FROM warehouses w
-- LEFT JOIN product_stock ps ON ps.warehouse_id = w.id
-- GROUP BY w.id, w.name;