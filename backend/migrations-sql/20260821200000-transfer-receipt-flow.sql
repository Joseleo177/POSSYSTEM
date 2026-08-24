-- Equivalente SQL de src/migrations/20260821200000-transfer-receipt-flow.js
--
-- El backend en Vercel no corre `db:migrate`, así que en la nube esta migración se aplica a
-- mano desde el editor SQL de Supabase. El INSERT final en "SequelizeMeta" es parte de la
-- migración: sin él, un despliegue que sí corra las migraciones intentará aplicarla de nuevo.
--
-- Todo va en una sola transacción: o queda el documento completo o no queda nada.

BEGIN;

-- ── Cabecera: la transferencia pasa a ser un documento con estado ───────────────
ALTER TABLE stock_transfers
  ADD COLUMN code              VARCHAR(30),
  -- 32 y no menos: 'received_with_differences' ocupa 25 caracteres.
  ADD COLUMN status            VARCHAR(32) NOT NULL DEFAULT 'sent',
  ADD COLUMN difference_status VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN dispatched_at     TIMESTAMPTZ,
  ADD COLUMN received_by       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN received_at       TIMESTAMPTZ,
  ADD COLUMN receipt_note      TEXT,
  ADD COLUMN cancelled_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN cancelled_at      TIMESTAMPTZ,
  ADD COLUMN cancel_reason     TEXT;

-- El producto ya no vive en la cabecera: pasa a las líneas. Estas columnas quedan solo por
-- el histórico anterior a esta migración.
ALTER TABLE stock_transfers ALTER COLUMN product_name DROP NOT NULL;
ALTER TABLE stock_transfers ALTER COLUMN qty          DROP NOT NULL;

-- ── Líneas ──────────────────────────────────────────────────────────────────────
CREATE TABLE stock_transfer_items (
  id              SERIAL PRIMARY KEY,
  transfer_id     INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL,
  product_name    VARCHAR(200) NOT NULL,
  unit            VARCHAR(20),
  -- NULL mientras la mercancía viaja: nadie ha contado todavía lo que llegó.
  qty_sent        NUMERIC(14,4) NOT NULL,
  qty_received    NUMERIC(14,4),
  diff_reason     VARCHAR(120),
  diff_resolution VARCHAR(20),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Histórico ───────────────────────────────────────────────────────────────────
-- Todo lo transferido hasta hoy ya está físicamente en el destino: entra como recibido sin
-- diferencias, con una línea por fila vieja.
INSERT INTO stock_transfer_items
  (transfer_id, product_id, product_name, qty_sent, qty_received, created_at, updated_at)
SELECT id, product_id, product_name, qty, qty, created_at, NOW()
  FROM stock_transfers
 WHERE product_id IS NOT NULL;

UPDATE stock_transfers
   SET status        = 'received',
       dispatched_at = created_at,
       received_at   = created_at,
       received_by   = employee_id,
       code          = 'TR-' || LPAD(id::text, 6, '0');

CREATE INDEX        idx_stock_transfers_company_status ON stock_transfers      (company_id, status);
CREATE INDEX        idx_stock_transfers_dest_status    ON stock_transfers      (to_warehouse_id, status);
CREATE UNIQUE INDEX idx_stock_transfers_company_code   ON stock_transfers      (company_id, code);
CREATE INDEX        idx_stock_transfer_items_transfer  ON stock_transfer_items (transfer_id);

INSERT INTO "SequelizeMeta" (name) VALUES ('20260821200000-transfer-receipt-flow.js');

COMMIT;
