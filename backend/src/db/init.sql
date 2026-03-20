-- ══════════════════════════════════════════════════════════════
--  POS System — Master Database Initialization
--  This script creates the entire schema at once.
-- ══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Roles & Permissions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL UNIQUE,  -- admin, manager, cashier, warehouse
  label       VARCHAR(100) NOT NULL,
  permissions JSONB        NOT NULL DEFAULT '{}'
);

-- ── 2. Employees ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(150) UNIQUE,
  phone         VARCHAR(20),
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Currencies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currencies (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(3)     NOT NULL UNIQUE,  -- MXN, USD, VES...
  name          VARCHAR(100)   NOT NULL,
  symbol        VARCHAR(5)     NOT NULL,
  exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  is_base       BOOLEAN        NOT NULL DEFAULT FALSE,
  active        BOOLEAN        NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── 4. Settings (Key-Value) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- ── 5. Product Catalog (Categories & Products) ────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(200)    NOT NULL,
  price            NUMERIC(10, 2)  NOT NULL CHECK (price >= 0),
  stock            NUMERIC(10, 3)  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  unit             VARCHAR(20)     NOT NULL DEFAULT 'unidad',
  qty_step         NUMERIC(10, 3)  NOT NULL DEFAULT 1.000,
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_filename   VARCHAR(255),
  cost_price       NUMERIC(10, 2)  DEFAULT NULL,
  profit_margin    NUMERIC(5,  2)  DEFAULT NULL,
  package_size     NUMERIC(10, 3)  DEFAULT NULL,
  package_unit     VARCHAR(50)     DEFAULT NULL,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── 6. Banks & Payment Methods ────────────────────────────────
CREATE TABLE IF NOT EXISTS banks (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(200) NOT NULL UNIQUE,
  code       VARCHAR(10),
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  code       VARCHAR(50)  NOT NULL UNIQUE,
  icon       VARCHAR(10)  DEFAULT '💳',
  color      VARCHAR(7)   NOT NULL DEFAULT '#555555',
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 7. Multi-Warehouse System ──────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_stock (
  warehouse_id INTEGER        NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id   INTEGER        NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  qty          NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (warehouse_id, product_id)
);

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

CREATE TABLE IF NOT EXISTS employee_warehouses (
  employee_id  INTEGER NOT NULL REFERENCES employees(id)  ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, warehouse_id)
);

-- ── 8. Customers & Suppliers ───────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(20)   NOT NULL DEFAULT 'cliente',  -- cliente | proveedor
  name       VARCHAR(200)  NOT NULL,
  phone      VARCHAR(20),
  email      VARCHAR(150)  UNIQUE,
  address    TEXT,
  rif        VARCHAR(15)   UNIQUE,
  tax_name   VARCHAR(200),
  tax_regime VARCHAR(100),
  notes      TEXT,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 9. Payment Journals ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_journals (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(30)  NOT NULL DEFAULT 'efectivo',
  bank_id     INTEGER      REFERENCES banks(id) ON DELETE SET NULL,
  currency_id INTEGER      REFERENCES currencies(id) ON DELETE SET NULL,
  bank        VARCHAR(200), -- Legacy field
  color       VARCHAR(7)   NOT NULL DEFAULT '#555555',
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL DEFAULT 0
);

-- ── 10. Invoice Series ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  prefix     VARCHAR(10)  NOT NULL,
  padding    INT          NOT NULL DEFAULT 4,
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS serie_ranges (
  id             SERIAL PRIMARY KEY,
  serie_id       INT     NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  start_number   INT     NOT NULL,
  end_number     INT     NOT NULL,
  current_number INT     NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_series (
  user_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  serie_id INT NOT NULL REFERENCES series(id)   ON DELETE CASCADE,
  PRIMARY KEY (user_id, serie_id)
);

-- ── 11. Sales ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id                 SERIAL PRIMARY KEY,
  total              NUMERIC(10, 2) NOT NULL,
  paid               NUMERIC(10, 2) NOT NULL,
  change             NUMERIC(10, 2) NOT NULL,
  status             VARCHAR(20)    NOT NULL DEFAULT 'pendiente',
  customer_id        INTEGER        REFERENCES customers(id)        ON DELETE SET NULL,
  employee_id        INTEGER        REFERENCES employees(id)        ON DELETE SET NULL,
  currency_id        INTEGER        REFERENCES currencies(id)       ON DELETE SET NULL,
  exchange_rate      NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  discount_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_method     VARCHAR(30)    NOT NULL DEFAULT 'efectivo',
  payment_method_id  INTEGER        REFERENCES payment_methods(id)  ON DELETE SET NULL,
  payment_journal_id INTEGER        REFERENCES payment_journals(id) ON DELETE SET NULL,
  warehouse_id       INTEGER        REFERENCES warehouses(id)       ON DELETE SET NULL,
  serie_id           INTEGER        REFERENCES series(id)           ON DELETE SET NULL,
  serie_range_id     INTEGER        REFERENCES serie_ranges(id)     ON DELETE SET NULL,
  correlative_number INTEGER,
  invoice_number     VARCHAR(50),
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER        REFERENCES products(id) ON DELETE SET NULL,
  name        VARCHAR(200)   NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  quantity    NUMERIC(10, 3) NOT NULL CHECK (quantity > 0),
  discount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  subtotal    NUMERIC(10, 2) GENERATED ALWAYS AS ((price - discount) * quantity) STORED
);

-- ── 12. Payments (cobros sobre facturas) ──────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                 SERIAL PRIMARY KEY,
  sale_id            INTEGER        NOT NULL REFERENCES sales(id)            ON DELETE CASCADE,
  customer_id        INTEGER        REFERENCES customers(id)                 ON DELETE SET NULL,
  amount             NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency_id        INTEGER        REFERENCES currencies(id)                ON DELETE SET NULL,
  exchange_rate      NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  payment_journal_id INTEGER        REFERENCES payment_journals(id)          ON DELETE SET NULL,
  employee_id        INTEGER        REFERENCES employees(id)                 ON DELETE SET NULL,
  reference_date     DATE,
  reference_number   VARCHAR(100),
  notes              TEXT,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_sale_id    ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer   ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- ── 13. Purchases ──────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS purchase_items (
  id             SERIAL PRIMARY KEY,
  purchase_id    INTEGER        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id     INTEGER        REFERENCES products(id) ON DELETE SET NULL,
  product_name   VARCHAR(200)   NOT NULL,
  package_unit   VARCHAR(50)    NOT NULL DEFAULT 'unidad',
  package_qty    NUMERIC(10,3)  NOT NULL DEFAULT 1,
  package_size   NUMERIC(10,3)  NOT NULL DEFAULT 1,
  package_price  NUMERIC(10,2)  NOT NULL,
  unit_cost      NUMERIC(10,2)  NOT NULL,
  profit_margin  NUMERIC(5,2)   NOT NULL DEFAULT 0,
  sale_price     NUMERIC(10,2)  NOT NULL,
  total_units    NUMERIC(10,3)  NOT NULL,
  subtotal       NUMERIC(10,2)  NOT NULL
);

-- ── 15. Triggers & Functions ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at  BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 16. Indices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale      ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at     ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name       ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_rif        ON customers(rif);
CREATE INDEX IF NOT EXISTS idx_sales_customer       ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_employee       ON sales(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_journal        ON sales(payment_journal_id);
CREATE INDEX IF NOT EXISTS idx_employees_username   ON employees(username);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purch ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_product   ON product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_warehouse ON product_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_created_at    ON stock_transfers(created_at DESC);

-- ── 17. Initial Data ──────────────────────────────────────────

-- Roles
INSERT INTO roles (name, label, permissions) VALUES
  ('admin',     'Administrador', '{"all": true}'::jsonb),
  ('manager',   'Gerente',       '{"sales":true,"reports":true,"config":true,"customers":true,"products":true}'::jsonb),
  ('cashier',   'Cajero',        '{"sales":true,"customers":true,"inventory_view":true}'::jsonb),
  ('warehouse', 'Almacén',       '{"products":true,"inventory":true,"categories":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Default Admin (password: admin1234)
INSERT INTO employees (username, password_hash, full_name, email, role_id)
VALUES (
  'admin',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Administrador',
  'admin@mitienda.com',
  (SELECT id FROM roles WHERE name = 'admin')
) ON CONFLICT (username) DO NOTHING;

-- Currencies
INSERT INTO currencies (code, name, symbol, exchange_rate, is_base, active) VALUES
  ('USD', 'Dólar Americano',  '$',   1.000000, TRUE,  TRUE),
  ('VES', 'Bolívar Venezolano', 'Bs.', 36.000000, FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Settings
INSERT INTO settings (key, value) VALUES
  ('store_name',      'Mi Tienda'),
  ('tax_rate',        '16'),
  ('tax_name',        'IVA'),
  ('base_currency',   'USD')
ON CONFLICT (key) DO NOTHING;

-- Warehouses
INSERT INTO warehouses (name, description, sort_order) VALUES ('Principal', 'Almacén Principal', 0) ON CONFLICT (name) DO NOTHING;

-- Banks
INSERT INTO banks (name, code, sort_order) VALUES
  ('Banco de Venezuela', '0102', 0), ('Banesco', '0134', 1), ('Banco Mercantil', '0105', 2), ('BBVA Provincial', '0108', 3)
ON CONFLICT (name) DO NOTHING;

-- Payment Methods
INSERT INTO payment_methods (name, code, icon, color, sort_order) VALUES
  ('Efectivo', 'efectivo', '💵', '#27ae60', 0),
  ('Transferencia', 'transferencia', '🏦', '#5dade2', 1),
  ('Pago Móvil', 'pago_movil', '📱', '#f0a500', 2),
  ('Zelle', 'zelle', '💱', '#9b59b6', 3),
  ('Punto de Venta', 'punto_venta', '💳', '#e74c3c', 4)
ON CONFLICT (code) DO NOTHING;
