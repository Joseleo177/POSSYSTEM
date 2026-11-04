-- Agenda de citas (migración 20261107100000-agenda.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar backend y frontend: los modelos Company y
-- Product ya leen companies.citas_enabled y products.duration_min, y sin esas columnas falla el
-- inicio de sesión y todo lo que toque productos. Es idempotente: se puede correr dos veces.
--
-- PASO 0 (solo lectura): ¿falta alguna migración anterior? Debe devolver 1 sola fila
-- (20261107100000-agenda.js). Si salen otras, correr primero sus .sql de esta carpeta, en orden.
--
-- SELECT m.name FROM (VALUES
--   ('20261028100000-cobro-tasa-divisas.js'),
--   ('20261028110000-tasa-divisas-base-y-rebaja.js'),
--   ('20261029100000-avances-efectivo.js'),
--   ('20261029110000-avance-con-pago.js'),
--   ('20261030100000-login-events.js'),
--   ('20261031100000-cocina.js'),
--   ('20261031110000-mesas.js'),
--   ('20261031120000-comandas.js'),
--   ('20261031130000-adicionales.js'),
--   ('20261031140000-agotados.js'),
--   ('20261031150000-pedir-cuenta.js'),
--   ('20261031160000-mesas-giro.js'),
--   ('20261101100000-recetas.js'),
--   ('20261101110000-produccion.js'),
--   ('20261101120000-mesa-qr.js'),
--   ('20261101130000-indice-mesas-abiertas.js'),
--   ('20261101140000-pedidos-qr.js'),
--   ('20261101150000-pedidos-web-entrega-pago.js'),
--   ('20261101160000-pedidos-etapas.js'),
--   ('20261102100000-company-seo-enabled.js'),
--   ('20261103100000-clientes-mesa.js'),
--   ('20261104100000-product-images.js'),
--   ('20261105100000-comisiones.js'),
--   ('20261105110000-permisos-por-usuario.js'),
--   ('20261106100000-cashea.js'),
--   ('20261107100000-agenda.js')
-- ) AS m(name)
--  WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" s WHERE s.name = m.name)
--  ORDER BY 1;

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS citas_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS duration_min SMALLINT
  CHECK (duration_min IS NULL OR duration_min BETWEEN 5 AND 720);

CREATE TABLE IF NOT EXISTS agenda_resources (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  kind         VARCHAR(10) NOT NULL DEFAULT 'persona' CHECK (kind IN ('persona', 'puesto')),
  name         VARCHAR(80) NOT NULL,
  capacity     SMALLINT NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),
  seller_id    INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  color        VARCHAR(7),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agenda_resources_wh ON agenda_resources (company_id, warehouse_id) WHERE active;

CREATE TABLE IF NOT EXISTS agenda_hours (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES agenda_resources(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min   SMALLINT NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min     SMALLINT NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX IF NOT EXISTS agenda_hours_resource ON agenda_hours (resource_id, weekday);

CREATE TABLE IF NOT EXISTS agenda_blocks (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES agenda_resources(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS agenda_blocks_resource ON agenda_blocks (resource_id, starts_at);

CREATE TABLE IF NOT EXISTS agenda_resource_services (
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES agenda_resources(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, product_id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  resource_id    INTEGER NOT NULL REFERENCES agenda_resources(id) ON DELETE RESTRICT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  status         VARCHAR(12) NOT NULL DEFAULT 'confirmada'
                 CHECK (status IN ('pendiente', 'confirmada', 'en_curso', 'terminada', 'no_asistio', 'cancelada')),
  source         VARCHAR(10) NOT NULL DEFAULT 'interno' CHECK (source IN ('interno', 'vitrina')),
  customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  VARCHAR(120),
  customer_phone VARCHAR(30),
  customer_doc   VARCHAR(20),
  notes          VARCHAR(300),
  sale_id        INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_by     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
-- Lo que ocupa la agenda: el cruce de horarios y el día de la sucursal.
CREATE INDEX IF NOT EXISTS appointments_resource_live ON appointments (resource_id, starts_at)
  WHERE status NOT IN ('cancelada', 'no_asistio');
CREATE INDEX IF NOT EXISTS appointments_wh_day ON appointments (company_id, warehouse_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_sale ON appointments (sale_id) WHERE sale_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_items (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name           VARCHAR(200) NOT NULL,
  duration_min   SMALLINT NOT NULL CHECK (duration_min BETWEEN 5 AND 720)
);
CREATE INDEX IF NOT EXISTS appointment_items_appt ON appointment_items (appointment_id);

ALTER TABLE agenda_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_resource_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_items ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261107100000-agenda.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261107100000-agenda.js');

COMMIT;

-- Verificación final: 6 filas con rowsecurity = true, y 2 columnas abajo.
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('agenda_resources', 'agenda_hours', 'agenda_blocks',
                     'agenda_resource_services', 'appointments', 'appointment_items')
 ORDER BY 1;
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'companies' AND column_name = 'citas_enabled')
     OR (table_name = 'products' AND column_name = 'duration_min'));
