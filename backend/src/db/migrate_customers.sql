-- ══════════════════════════════════════
--  Migración: Módulo de Clientes
-- ══════════════════════════════════════

-- ── Tabla de clientes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200)  NOT NULL,
  phone      VARCHAR(20),
  email      VARCHAR(150)  UNIQUE,
  address    TEXT,
  rif        VARCHAR(13)   UNIQUE,
  tax_name   VARCHAR(200),           -- Razón social
  tax_regime VARCHAR(100),           -- Régimen fiscal
  notes      TEXT,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Asociar cliente a ventas ─────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

-- ── Trigger updated_at ───────────────────────────────────────
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_rif   ON customers(rif);
CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id);
