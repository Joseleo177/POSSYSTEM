-- ══════════════════════════════════════
--  POS System — Inicialización DB
-- ══════════════════════════════════════

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Roles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,  -- admin, manager, cashier, warehouse
  label       VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'
);

-- ── Empleados ────────────────────────────────────────────────
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

-- ── Monedas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currencies (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(3)     NOT NULL UNIQUE,  -- MXN, USD, EUR
  name          VARCHAR(100)   NOT NULL,
  symbol        VARCHAR(5)     NOT NULL,
  exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.0,  -- relativo a moneda base
  is_base       BOOLEAN        NOT NULL DEFAULT FALSE,
  active        BOOLEAN        NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── Configuración general ────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- ── Categorías ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- ── Productos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(200)    NOT NULL,
  price            NUMERIC(10, 2)  NOT NULL CHECK (price >= 0),
  stock            NUMERIC(10, 3)  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  unit             VARCHAR(20)     NOT NULL DEFAULT 'unidad',  -- kg, litro, metro, unidad…
  qty_step         NUMERIC(10, 3)  NOT NULL DEFAULT 1.000,     -- fracción mínima vendible
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_filename   VARCHAR(255),
  cost_price       NUMERIC(10, 2)  DEFAULT NULL,               -- costo unitario
  profit_margin    NUMERIC(5,  2)  DEFAULT NULL,               -- % margen de ganancia
  package_size     NUMERIC(10, 3)  DEFAULT NULL,               -- unidades por paquete
  package_unit     VARCHAR(50)     DEFAULT NULL,               -- nombre del paquete (caja, bulto…)
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── Diarios de pago ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_journals (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(30)  NOT NULL DEFAULT 'efectivo',
  bank       VARCHAR(200),
  color      VARCHAR(7)   NOT NULL DEFAULT '#555555',
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0
);

-- ── Ventas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id                 SERIAL PRIMARY KEY,
  total              NUMERIC(10, 2) NOT NULL,   -- en moneda base
  paid               NUMERIC(10, 2) NOT NULL,   -- en moneda de cobro
  change             NUMERIC(10, 2) NOT NULL,   -- en moneda de cobro
  customer_id        INTEGER,
  employee_id        INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  currency_id        INTEGER REFERENCES currencies(id) ON DELETE SET NULL,
  exchange_rate      NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  discount_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_method     VARCHAR(30)    NOT NULL DEFAULT 'efectivo',
  payment_journal_id INTEGER        REFERENCES payment_journals(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── Líneas de venta ─────────────────────────────────────────
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

-- ── Recibos de compra ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id            SERIAL PRIMARY KEY,
  supplier_id   INTEGER        REFERENCES customers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(200),
  notes         TEXT,
  total         NUMERIC(10,2)  NOT NULL DEFAULT 0,
  employee_id   INTEGER        REFERENCES employees(id) ON DELETE SET NULL,
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

-- ── Auto-actualizar updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_currencies_updated_at
  BEFORE UPDATE ON currencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Clientes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(20)   NOT NULL DEFAULT 'cliente',  -- cliente | proveedor
  name       VARCHAR(200)  NOT NULL,
  phone      VARCHAR(20),
  email      VARCHAR(150)  UNIQUE,
  address    TEXT,
  rif        VARCHAR(15)   UNIQUE,  -- RIF o Cédula
  tax_name   VARCHAR(200),          -- Razón Social (solo proveedores)
  tax_regime VARCHAR(100),
  notes      TEXT,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- FK de sales → customers
ALTER TABLE sales
  ADD CONSTRAINT fk_sales_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  NOT VALID;

-- ── Índices ──────────────────────────────────────────────────
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

-- ══════════════════════════════════════
--  Datos iniciales
-- ══════════════════════════════════════

-- Roles
INSERT INTO roles (name, label, permissions) VALUES
  ('admin',     'Administrador', '{"all": true}'::jsonb),
  ('manager',   'Gerente',       '{"sales":true,"reports":true,"config":true,"customers":true,"products":true}'::jsonb),
  ('cashier',   'Cajero',        '{"sales":true,"customers":true,"inventory_view":true}'::jsonb),
  ('warehouse', 'Almacén',       '{"products":true,"inventory":true,"categories":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Admin por defecto  (password: admin1234)
INSERT INTO employees (username, password_hash, full_name, email, role_id)
VALUES (
  'admin',
  '$2b$10$OwGGa6dSYoS7bqtLdDyaa.vvl3an.TTFNZpOQoZlZqX/pm.OVVfbq',
  'Administrador',
  'admin@mitienda.com',
  (SELECT id FROM roles WHERE name = 'admin')
) ON CONFLICT (username) DO NOTHING;

-- Monedas
INSERT INTO currencies (code, name, symbol, exchange_rate, is_base, active) VALUES
  ('USD', 'Dólar Americano',  '$',   1.000000, TRUE,  TRUE),
  ('VES', 'Bolívar Venezolano',  'Bs.', 36.00,   FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Configuración por defecto
INSERT INTO settings (key, value) VALUES
  ('store_name',      'Mi Tienda'),
  ('store_address',   ''),
  ('store_phone',     ''),
  ('store_email',     ''),
  ('tax_rate',        '16'),
  ('tax_name',        'IVA'),
  ('base_currency',   'USD'),
  ('receipt_footer',  '¡Gracias por su compra!'),
  ('logo_filename',   '')
ON CONFLICT (key) DO NOTHING;

-- Categorías y productos de ejemplo
INSERT INTO categories (name) VALUES
  ('Papelería'), ('Bebidas'), ('Snacks'), ('Limpieza'), ('General')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, price, stock, category_id) VALUES
  ('Cuaderno',       25.00,  50, (SELECT id FROM categories WHERE name='Papelería')),
  ('Bolígrafo',       8.00, 120, (SELECT id FROM categories WHERE name='Papelería')),
  ('Refresco 600ml', 18.00,  30, (SELECT id FROM categories WHERE name='Bebidas')),
  ('Agua 500ml',     12.00,  60, (SELECT id FROM categories WHERE name='Bebidas')),
  ('Galletas',       15.00,  45, (SELECT id FROM categories WHERE name='Snacks')),
  ('Chicles',         5.00,  80, (SELECT id FROM categories WHERE name='Snacks')),
  ('Jabón de manos', 22.00,  25, (SELECT id FROM categories WHERE name='Limpieza')),
  ('Servilletas',    18.00,  40, (SELECT id FROM categories WHERE name='Limpieza'))
ON CONFLICT DO NOTHING;
