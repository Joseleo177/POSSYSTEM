-- MÓDULO FÁBRICA, en SQL para el editor de Supabase.
--
-- Equivale a correr `db:migrate` con 20261023100000-fabrica, 20261024100000-fabrica-recetas-etapas,
-- 20261025100000-fabrica-entrega-por-corte, 20261026100000-fabrica-pieza-varios-cortes y
-- 20261026110000-fabrica-dibujo-corte y 20261026120000-fabrica-retazo-con-forma, y las registra en
-- SequelizeMeta. Crea diez tablas nuevas y les activa RLS sin políticas, como
-- al resto de public.
-- Se puede correr dos veces sin daño (IF NOT EXISTS / ON CONFLICT).
--
-- Orden de despliegue: primero este SQL, después el deploy del backend en Vercel.
-- El módulo queda apagado en todas las empresas: se enciende por empresa desde Empresas.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS fabrica_enabled BOOLEAN NOT NULL DEFAULT false;

-- Control por piezas del producto: 'area' (M2) o 'length' (METRO), con su formato habitual.
ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_mode VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_width_mm INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_length_mm INTEGER;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_piece_mode_check;
ALTER TABLE products ADD CONSTRAINT products_piece_mode_check
  CHECK (piece_mode IS NULL OR piece_mode IN ('area', 'length'));

-- Medidas de cada pieza en una línea de compra.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS piece_width_mm INTEGER;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS piece_length_mm INTEGER;

CREATE TABLE IF NOT EXISTS material_pieces (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
  code             VARCHAR(40) NOT NULL,
  root_number      INTEGER NOT NULL,
  parent_id        INTEGER REFERENCES material_pieces(id),
  width_mm         INTEGER CHECK (width_mm IS NULL OR width_mm > 0),
  length_mm        INTEGER CHECK (length_mm IS NULL OR length_mm > 0),
  is_irregular     BOOLEAN NOT NULL DEFAULT false,
  size             DECIMAL(12,3) NOT NULL CHECK (size > 0),
  unit_cost        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status           VARCHAR(20) NOT NULL DEFAULT 'disponible'
                   CHECK (status IN ('disponible', 'en_taller', 'consumida', 'baja', 'anulada')),
  origin           VARCHAR(20) NOT NULL DEFAULT 'compra'
                   CHECK (origin IN ('compra', 'carga_inicial', 'existencia', 'retazo')),
  source_order_id  INTEGER,
  purchase_item_id INTEGER,
  reference        VARCHAR(80),
  notes            TEXT,
  employee_id      INTEGER REFERENCES employees(id),
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS material_pieces_code_key ON material_pieces (company_id, code);
CREATE INDEX IF NOT EXISTS material_pieces_stock_idx ON material_pieces (company_id, product_id, warehouse_id, status);
CREATE INDEX IF NOT EXISTS material_pieces_root_idx ON material_pieces (company_id, root_number);
CREATE INDEX IF NOT EXISTS material_pieces_purchase_idx ON material_pieces (purchase_item_id) WHERE purchase_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS material_pieces_parent_idx ON material_pieces (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fabrication_orders (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL,
  warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
  type             VARCHAR(20) NOT NULL DEFAULT 'medida' CHECK (type IN ('estandar', 'medida')),
  destination      VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (destination IN ('stock', 'cliente')),
  product_id       INTEGER REFERENCES products(id),
  description      VARCHAR(300) NOT NULL,
  quantity         DECIMAL(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customer_id      INTEGER REFERENCES customers(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'terminada', 'anulada')),
  material_cost    DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (material_cost >= 0),
  accessories_cost DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (accessories_cost >= 0),
  sale_price       DECIMAL(14,5) CHECK (sale_price IS NULL OR sale_price >= 0),
  sale_id          INTEGER REFERENCES sales(id),
  notes            TEXT,
  employee_id      INTEGER REFERENCES employees(id),
  finished_at      TIMESTAMPTZ,
  invoiced_at      TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    VARCHAR(300),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS fabrication_orders_number_key ON fabrication_orders (company_id, number);
CREATE INDEX IF NOT EXISTS fabrication_orders_status_idx ON fabrication_orders (company_id, status, created_at);

CREATE TABLE IF NOT EXISTS fabrication_order_pieces (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  order_id         INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  piece_id         INTEGER NOT NULL REFERENCES material_pieces(id),
  delivered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_by     INTEGER REFERENCES employees(id),
  returned_at      TIMESTAMPTZ,
  returned_by      INTEGER REFERENCES employees(id),
  consumed         DECIMAL(12,3) CHECK (consumed IS NULL OR consumed > 0),
  cost             DECIMAL(14,4) CHECK (cost IS NULL OR cost >= 0),
  note             TEXT
);
CREATE INDEX IF NOT EXISTS fabrication_order_pieces_order_idx ON fabrication_order_pieces (order_id);
CREATE INDEX IF NOT EXISTS fabrication_order_pieces_piece_idx ON fabrication_order_pieces (piece_id);

CREATE TABLE IF NOT EXISTS fabrication_order_items (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  order_id         INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  product_name     VARCHAR(200) NOT NULL,
  quantity         DECIMAL(10,3) NOT NULL CHECK (quantity > 0),
  unit_cost        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  employee_id      INTEGER REFERENCES employees(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fabrication_order_items_order_idx ON fabrication_order_items (order_id);

-- API pública de PostgREST cerrada, igual que el resto de public.
ALTER TABLE material_pieces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_order_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_order_items  ENABLE ROW LEVEL SECURITY;

-- ── Recetas con fórmulas, etapas del taller y mano de obra
--    (migración 20261024100000-fabrica-recetas-etapas) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fabrication_stages (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(60) NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  cost_per_hour DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (cost_per_hour >= 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS fabrication_stages_name_key ON fabrication_stages (company_id, lower(name));

CREATE TABLE IF NOT EXISTS fabrication_recipes (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  unit         VARCHAR(2) NOT NULL DEFAULT 'm' CHECK (unit IN ('m', 'cm', 'mm')),
  params       JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT,
  employee_id  INTEGER REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS fabrication_recipes_product_key ON fabrication_recipes (company_id, product_id);

CREATE TABLE IF NOT EXISTS fabrication_recipe_items (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  recipe_id     INTEGER NOT NULL REFERENCES fabrication_recipes(id) ON DELETE CASCADE,
  kind          VARCHAR(20) NOT NULL CHECK (kind IN ('material', 'accesorio', 'proceso')),
  component_id  INTEGER REFERENCES products(id),
  stage_id      INTEGER REFERENCES fabrication_stages(id),
  width_expr    VARCHAR(200),
  length_expr   VARCHAR(200),
  cuts_expr     VARCHAR(200),
  quantity_expr VARCHAR(200),
  minutes_expr  VARCHAR(200),
  position      INTEGER NOT NULL DEFAULT 0,
  CHECK (
    (kind = 'material'  AND component_id IS NOT NULL AND length_expr IS NOT NULL AND cuts_expr IS NOT NULL) OR
    (kind = 'accesorio' AND component_id IS NOT NULL AND quantity_expr IS NOT NULL) OR
    (kind = 'proceso'   AND stage_id IS NOT NULL AND minutes_expr IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS fabrication_recipe_items_recipe_idx ON fabrication_recipe_items (recipe_id);
CREATE INDEX IF NOT EXISTS fabrication_recipe_items_component_idx ON fabrication_recipe_items (component_id);
CREATE INDEX IF NOT EXISTS fabrication_recipe_items_stage_idx ON fabrication_recipe_items (stage_id);

CREATE TABLE IF NOT EXISTS fabrication_order_plan (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  order_id       INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  kind           VARCHAR(20) NOT NULL CHECK (kind IN ('material', 'accesorio', 'proceso')),
  component_id   INTEGER REFERENCES products(id),
  stage_id       INTEGER REFERENCES fabrication_stages(id),
  name           VARCHAR(200) NOT NULL,
  cut_width_mm   INTEGER CHECK (cut_width_mm IS NULL OR cut_width_mm > 0),
  cut_length_mm  INTEGER CHECK (cut_length_mm IS NULL OR cut_length_mm > 0),
  cuts           INTEGER CHECK (cuts IS NULL OR cuts > 0),
  quantity       DECIMAL(10,3) CHECK (quantity IS NULL OR quantity > 0),
  minutes        DECIMAL(10,2) CHECK (minutes IS NULL OR minutes >= 0),
  position       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fabrication_order_plan_order_idx ON fabrication_order_plan (order_id);

CREATE TABLE IF NOT EXISTS fabrication_order_stages (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  order_id      INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  stage_id      INTEGER NOT NULL REFERENCES fabrication_stages(id),
  stage_name    VARCHAR(60) NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  minutes       DECIMAL(10,2) CHECK (minutes IS NULL OR minutes >= 0),
  cost_per_hour DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (cost_per_hour >= 0),
  cost          DECIMAL(14,4) CHECK (cost IS NULL OR cost >= 0),
  worker        VARCHAR(80),
  note          VARCHAR(300),
  employee_id   INTEGER REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS fabrication_order_stages_order_idx ON fabrication_order_stages (order_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS fabrication_order_stages_open_key ON fabrication_order_stages (order_id) WHERE finished_at IS NULL;

ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS params JSONB;
ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS current_stage_id INTEGER REFERENCES fabrication_stages(id);
ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE fabrication_orders ADD COLUMN IF NOT EXISTS assignee VARCHAR(80);
ALTER TABLE fabrication_orders DROP CONSTRAINT IF EXISTS fabrication_orders_labor_cost_check;
ALTER TABLE fabrication_orders ADD CONSTRAINT fabrication_orders_labor_cost_check CHECK (labor_cost >= 0);
CREATE INDEX IF NOT EXISTS fabrication_orders_stage_idx ON fabrication_orders (company_id, current_stage_id) WHERE status = 'abierta';

ALTER TABLE fabrication_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_recipes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_order_plan   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrication_order_stages ENABLE ROW LEVEL SECURITY;

-- ── Entregas atadas a un corte de la receta (migración 20261025100000) ────────────────
ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES fabrication_order_plan(id) ON DELETE SET NULL;
ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS cuts_covered INTEGER;
ALTER TABLE fabrication_order_pieces DROP CONSTRAINT IF EXISTS fabrication_order_pieces_cuts_covered_check;
ALTER TABLE fabrication_order_pieces ADD CONSTRAINT fabrication_order_pieces_cuts_covered_check CHECK (cuts_covered IS NULL OR cuts_covered > 0);
CREATE INDEX IF NOT EXISTS fabrication_order_pieces_plan_idx ON fabrication_order_pieces (plan_id) WHERE plan_id IS NOT NULL;

-- ── Una pieza cubre varios cortes de su orden (migración 20261026100000) ──────────────
-- Las dos columnas de arriba pasan a esta tabla y se borran (volver a correr el archivo las
-- crea vacías y las vuelve a borrar).
CREATE TABLE IF NOT EXISTS fabrication_order_cuts (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  order_id   INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
  use_id     INTEGER NOT NULL REFERENCES fabrication_order_pieces(id) ON DELETE CASCADE,
  plan_id    INTEGER NOT NULL REFERENCES fabrication_order_plan(id) ON DELETE CASCADE,
  cuts       INTEGER NOT NULL CHECK (cuts > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS fabrication_order_cuts_use_plan_key ON fabrication_order_cuts (use_id, plan_id);
CREATE INDEX IF NOT EXISTS fabrication_order_cuts_plan_idx ON fabrication_order_cuts (plan_id);
INSERT INTO fabrication_order_cuts (company_id, order_id, use_id, plan_id, cuts, created_at)
SELECT company_id, order_id, id, plan_id, cuts_covered, delivered_at
  FROM fabrication_order_pieces
 WHERE plan_id IS NOT NULL AND cuts_covered > 0
ON CONFLICT (use_id, plan_id) DO NOTHING;
DROP INDEX IF EXISTS fabrication_order_pieces_plan_idx;
ALTER TABLE fabrication_order_pieces DROP CONSTRAINT IF EXISTS fabrication_order_pieces_cuts_covered_check;
ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS cuts_covered;
ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS plan_id;
ALTER TABLE fabrication_order_cuts ENABLE ROW LEVEL SECURITY;

-- ── Dibujo de cómo se picó la pieza al devolverla (migración 20261026110000) ─────────
ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS layout JSONB;

-- ── Retazos con forma: varios pedazos unidos en una pieza en L (migración 20261026120000) ──
ALTER TABLE material_pieces ADD COLUMN IF NOT EXISTS shape JSONB;

INSERT INTO "SequelizeMeta" (name) VALUES
  ('20261023100000-fabrica.js'), ('20261024100000-fabrica-recetas-etapas.js'), ('20261025100000-fabrica-entrega-por-corte.js'),
  ('20261026100000-fabrica-pieza-varios-cortes.js'), ('20261026110000-fabrica-dibujo-corte.js'),
  ('20261026120000-fabrica-retazo-con-forma.js')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- Comprobación: 10 tablas con RLS activo y las columnas nuevas.
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname IN ('material_pieces', 'fabrication_orders', 'fabrication_order_pieces', 'fabrication_order_items',
                   'fabrication_recipes', 'fabrication_recipe_items', 'fabrication_order_plan',
                   'fabrication_stages', 'fabrication_order_stages', 'fabrication_order_cuts');
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE (table_name = 'companies'      AND column_name = 'fabrica_enabled')
    OR (table_name = 'products'       AND column_name IN ('piece_mode', 'piece_width_mm', 'piece_length_mm'))
    OR (table_name = 'purchase_items' AND column_name IN ('piece_width_mm', 'piece_length_mm'));
