-- ══════════════════════════════════════════════════════════════
--  Migración: Diarios de pago (payment_journals)
-- ══════════════════════════════════════════════════════════════

-- ── Tabla de diarios de pago ─────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_journals (
  id         SERIAL       PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(30)  NOT NULL DEFAULT 'efectivo',
  bank       VARCHAR(200),
  color      VARCHAR(7)   NOT NULL DEFAULT '#555555',
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order INTEGER      NOT NULL DEFAULT 0
);

-- ── Columna payment_journal_id en sales ──────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_journal_id
    INTEGER REFERENCES payment_journals(id) ON DELETE SET NULL;

-- ── Índice ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_journal ON sales(payment_journal_id);
