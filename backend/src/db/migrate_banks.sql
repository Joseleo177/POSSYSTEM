-- ══════════════════════════════════════════════════════════════
--  MIGRACIÓN: Bancos y Métodos de Pago dinámicos
--  Ejecutar UNA sola vez sobre la BD existente
-- ══════════════════════════════════════════════════════════════

-- ── 1. Catálogo de bancos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS banks (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(200) NOT NULL UNIQUE,
  code       VARCHAR(10),           -- código bancario ej. 0102
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. Métodos de pago dinámicos ──────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,  -- nombre visible: "Pago Móvil"
  code       VARCHAR(50)  NOT NULL UNIQUE,  -- clave interna:  "pago_movil"
  icon       VARCHAR(10)  DEFAULT '💳',
  color      VARCHAR(7)   NOT NULL DEFAULT '#555555',
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 3. Agregar bank_id a payment_journals ─────────────────────
ALTER TABLE payment_journals
  ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES banks(id) ON DELETE SET NULL;

-- ── 4. Agregar payment_method_id a sales ─────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════════
--  DATOS INICIALES
-- ══════════════════════════════════════════════════════════════

-- Bancos venezolanos más comunes
INSERT INTO banks (name, code, sort_order) VALUES
  ('Banco de Venezuela',          '0102', 0),
  ('Banesco',                     '0134', 1),
  ('Banco Mercantil',             '0105', 2),
  ('BBVA Provincial',             '0108', 3),
  ('Banco Nacional de Crédito',   '0191', 4),
  ('Banco Exterior',              '0115', 5),
  ('Bancaribe',                   '0128', 6),
  ('Banco Bicentenario',          '0175', 7),
  ('Banco del Tesoro',            '0163', 8),
  ('Bancamiga',                   '0172', 9),
  ('Banco Activo',                '0171', 10),
  ('Banplus',                     '0174', 11),
  ('Banco Venezolano de Crédito', '0104', 12),
  ('Otro',                        NULL,   99)
ON CONFLICT (name) DO NOTHING;

-- Métodos de pago (migración de los hardcodeados)
INSERT INTO payment_methods (name, code, icon, color, sort_order) VALUES
  ('Efectivo',       'efectivo',      '💵', '#27ae60', 0),
  ('Transferencia',  'transferencia', '🏦', '#5dade2', 1),
  ('Pago Móvil',     'pago_movil',    '📱', '#f0a500', 2),
  ('Zelle',          'zelle',         '💱', '#9b59b6', 3),
  ('Punto de Venta', 'punto_venta',   '💳', '#e74c3c', 4)
ON CONFLICT (code) DO NOTHING;

-- ── 5. Migrar sales.payment_method (texto) → payment_method_id ─
UPDATE sales s
SET payment_method_id = pm.id
FROM payment_methods pm
WHERE s.payment_method = pm.code
  AND s.payment_method_id IS NULL;

-- ── 6. Migrar bank text → bank_id en payment_journals ─────────
UPDATE payment_journals pj
SET bank_id = b.id
FROM banks b
WHERE pj.bank IS NOT NULL
  AND pj.bank_id IS NULL
  AND (
    b.name ILIKE '%' || pj.bank || '%'
    OR pj.bank ILIKE '%' || b.name || '%'
  );

-- ══════════════════════════════════════════════════════════════
--  ÍNDICES
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_banks_name              ON banks(name);
CREATE INDEX IF NOT EXISTS idx_payment_methods_code    ON payment_methods(code);
CREATE INDEX IF NOT EXISTS idx_journals_bank_id        ON payment_journals(bank_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method_id ON sales(payment_method_id);

-- ══════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════
-- SELECT * FROM banks ORDER BY sort_order;
-- SELECT * FROM payment_methods ORDER BY sort_order;
-- SELECT COUNT(*) AS ventas_migradas FROM sales WHERE payment_method_id IS NOT NULL;
-- SELECT COUNT(*) AS ventas_sin_migrar FROM sales WHERE payment_method_id IS NULL;