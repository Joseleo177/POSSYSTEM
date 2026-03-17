-- ══════════════════════════════════════
--  Migración: Roles, Empleados, Monedas, Configuración
-- ══════════════════════════════════════

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL UNIQUE,
  label       VARCHAR(100) NOT NULL,
  permissions JSONB        NOT NULL DEFAULT '{}'
);

-- Empleados
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

-- Monedas
CREATE TABLE IF NOT EXISTS currencies (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(3)     NOT NULL UNIQUE,
  name          VARCHAR(100)   NOT NULL,
  symbol        VARCHAR(5)     NOT NULL,
  exchange_rate NUMERIC(12, 6) NOT NULL DEFAULT 1.0,
  is_base       BOOLEAN        NOT NULL DEFAULT FALSE,
  active        BOOLEAN        NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Configuración
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- Trigger updated_at para empleados y monedas
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_currencies_updated_at
  BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Nuevas columnas en sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS currency_id     INTEGER REFERENCES currencies(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS exchange_rate   NUMERIC(12,6) NOT NULL DEFAULT 1.0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Nueva columna discount en sale_items (subtotal se recalcula manualmente ya que es generated)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Columna image_filename en products (si no existe)
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);

-- Índices nuevos
CREATE INDEX IF NOT EXISTS idx_sales_employee     ON sales(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);

-- Datos iniciales
INSERT INTO roles (name, label, permissions) VALUES
  ('admin',     'Administrador', '{"all": true}'::jsonb),
  ('manager',   'Gerente',       '{"sales":true,"reports":true,"config":true,"customers":true,"products":true}'::jsonb),
  ('cashier',   'Cajero',        '{"sales":true,"customers":true,"inventory_view":true}'::jsonb),
  ('warehouse', 'Almacén',       '{"products":true,"inventory":true,"categories":true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Admin por defecto (password: admin1234)
INSERT INTO employees (username, password_hash, full_name, email, role_id)
VALUES (
  'admin',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Administrador',
  'admin@mitienda.com',
  (SELECT id FROM roles WHERE name = 'admin')
) ON CONFLICT (username) DO NOTHING;

INSERT INTO currencies (code, name, symbol, exchange_rate, is_base, active) VALUES
  ('MXN', 'Peso Mexicano',   '$',   1.000000, TRUE,  TRUE),
  ('USD', 'Dólar Americano', 'US$', 0.058000, FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('store_name',     'Mi Tienda'),
  ('store_address',  ''),
  ('store_phone',    ''),
  ('store_email',    ''),
  ('tax_rate',       '16'),
  ('tax_name',       'IVA'),
  ('base_currency',  'MXN'),
  ('receipt_footer', '¡Gracias por su compra!'),
  ('logo_filename',  '')
ON CONFLICT (key) DO NOTHING;
