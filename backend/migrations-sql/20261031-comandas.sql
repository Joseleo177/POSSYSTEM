-- Comandas por ronda y rol Mesonero (migración 20261031120000-comandas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-cocina.sql y 20261031-mesas.sql. Es idempotente: se puede correr dos veces sin daño.

BEGIN;

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  warehouse_id INTEGER,
  table_id     INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
  waiter_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  round_no     INTEGER NOT NULL DEFAULT 1,
  label        VARCHAR(120),
  note         VARCHAR(300),
  status       VARCHAR(12) NOT NULL DEFAULT 'nueva'
                 CHECK (status IN ('nueva', 'preparando', 'lista', 'entregada')),
  status_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kitchen_tickets_sale ON kitchen_tickets (sale_id);
CREATE INDEX IF NOT EXISTS kitchen_tickets_activas
    ON kitchen_tickets (company_id, status)
 WHERE status IN ('nueva', 'preparando', 'lista');
-- Como todo el esquema public: RLS activo sin políticas (el backend entra con su rol).
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
  product_id INTEGER,
  name       VARCHAR(255) NOT NULL,
  quantity   NUMERIC(12, 3) NOT NULL,
  note       VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS kitchen_ticket_items_ticket ON kitchen_ticket_items (ticket_id);
ALTER TABLE kitchen_ticket_items ENABLE ROW LEVEL SECURITY;

-- Las comandas vivas del esquema anterior pasan a ser la ronda 1 de su cuenta.
INSERT INTO kitchen_tickets (company_id, sale_id, warehouse_id, table_id, round_no, label, note, status, status_at, ready_at, created_at)
SELECT s.company_id, s.id, COALESCE(s.warehouse_id, s.requested_warehouse_id), s.table_id, 1,
       s.web_customer_name, LEFT(s.web_note, 300), s.kitchen_status,
       COALESCE(s.kitchen_status_at, s.created_at), s.kitchen_ready_at, s.created_at
  FROM sales s
 WHERE s.kitchen_status IN ('nueva', 'preparando', 'lista')
   AND NOT EXISTS (SELECT 1 FROM kitchen_tickets k WHERE k.sale_id = s.id);
INSERT INTO kitchen_ticket_items (ticket_id, product_id, name, quantity, note)
SELECT k.id, si.product_id, si.name, si.quantity, si.note
  FROM kitchen_tickets k
  JOIN sale_items si ON si.sale_id = k.sale_id
 WHERE NOT EXISTS (SELECT 1 FROM kitchen_ticket_items i WHERE i.ticket_id = k.id);

-- Rol Mesonero: plantilla y copia en cada empresa con restaurante.
INSERT INTO roles (name, label, permissions, company_id)
SELECT 'waiter', 'Mesonero', '{"tables.view": true, "tables.serve": true}'::jsonb, NULL
 WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'waiter' AND company_id IS NULL);
INSERT INTO roles (name, label, permissions, company_id)
SELECT 'waiter', 'Mesonero', '{"tables.view": true, "tables.serve": true}'::jsonb, c.id
  FROM companies c
 WHERE c.cocina_enabled
   AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = 'waiter' AND r.company_id = c.id);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031120000-comandas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031120000-comandas.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('kitchen_tickets', 'round_no'), ('kitchen_ticket_items', 'ticket_id')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
