'use strict';

// Agenda de citas (03-11-2026). La pidieron dos barberías, pero se diseñó para cualquier negocio
// que venda tiempo: barbería, consultorio, autolavado, spa.
//
//  - agenda_resources: lo que se agenda. Una persona (el barbero, el médico) con capacidad 1, o
//    un puesto con capacidad N (las 2 bahías del autolavado: dos carros a la vez). seller_id es
//    el vendedor que gana la comisión del servicio; employee_id, su usuario, para "mi agenda".
//  - agenda_hours: horario semanal en minutos desde la medianoche. Varias franjas por día dejan
//    el hueco del almuerzo.
//  - agenda_blocks: ausencias (vacaciones, cita médica del barbero), con hora.
//  - agenda_resource_services: quién hace cada servicio. Un servicio sin filas en una sucursal
//    lo hacen todos sus recursos (la regla es por servicio, no por recurso).
//  - products.duration_min: cuánto dura el servicio.
//  - appointments + appointment_items: la cita y sus servicios (corte + barba).
//
// La cita NO factura por su cuenta: al terminarla abre una cuenta en espera con createSale, como
// la ronda del mesonero, y se cobra con el mismo modal de cobro de siempre (ver services/agenda).
// "Cobrada" no se guarda: se lee del estado de la venta.
//
// Es un extra por empresa (companies.citas_enabled), apagado.
//
// SUPABASE: aplicar este SQL a mano ANTES del deploy, registrarlo en SequelizeMeta y activar RLS
// en las tablas nuevas (está al final del up).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
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
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS appointment_items;
      DROP TABLE IF EXISTS appointments;
      DROP TABLE IF EXISTS agenda_resource_services;
      DROP TABLE IF EXISTS agenda_blocks;
      DROP TABLE IF EXISTS agenda_hours;
      DROP TABLE IF EXISTS agenda_resources;
      ALTER TABLE products DROP COLUMN IF EXISTS duration_min;
      ALTER TABLE companies DROP COLUMN IF EXISTS citas_enabled;
    `);
  },
};
