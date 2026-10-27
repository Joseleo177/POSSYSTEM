'use strict';

// Mapa de mesas para restaurantes. Cada sucursal (almacén) tiene sus áreas —Salón, Terraza,
// Barra— y cada área sus mesas, con su lugar en el plano en una cuadrícula de 40 × 24.
//
// La cuenta de una mesa es la venta en 'espera' de siempre, con `sales.table_id`. No hay
// estado de mesa guardado: una mesa está ocupada si tiene una cuenta abierta, y así nunca
// queda "ocupada" una mesa que ya se cobró.
//
// `sales.waiter_id` es el mesonero que atiende la cuenta. Va aparte de `employee_id` a
// propósito: los mesoneros no cobran, y el resumen del turno de la caja cuenta las ventas por
// employee_id, que es el cajero (ver getSessionSummary).
//
// Las mesas no se borran: se desactivan, para no perder a qué mesa fue cada venta.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE IF NOT EXISTS dining_areas (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        name         VARCHAR(60) NOT NULL,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        active       BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS dining_areas_company_warehouse ON dining_areas (company_id, warehouse_id);

      CREATE TABLE IF NOT EXISTS dining_tables (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER,
        area_id      INTEGER NOT NULL REFERENCES dining_areas(id),
        name         VARCHAR(20) NOT NULL,
        seats        INTEGER NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 99),
        shape        VARCHAR(10) NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'rect')),
        x            INTEGER NOT NULL DEFAULT 0 CHECK (x BETWEEN 0 AND 39),
        y            INTEGER NOT NULL DEFAULT 0 CHECK (y BETWEEN 0 AND 23),
        w            INTEGER NOT NULL DEFAULT 4 CHECK (w BETWEEN 2 AND 12),
        h            INTEGER NOT NULL DEFAULT 4 CHECK (h BETWEEN 2 AND 12),
        active       BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS dining_tables_area ON dining_tables (area_id);
      CREATE INDEX IF NOT EXISTS dining_tables_company ON dining_tables (company_id);

      ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS waiter_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
    `);

    // Ver el mapa se concede a quien ya cobraba: el cajero lo necesita para cobrar por mesa
    // apenas se encienda el módulo. Editar el plano queda solo para el administrador. En una
    // empresa sin restaurante el permiso no abre nada (el módulo está apagado).
    await q(`
      UPDATE roles
         SET permissions = permissions || '{"tables.view": true}'::jsonb
       WHERE (permissions->>'sales.create') = 'true' OR (permissions->>'sales') = 'true'
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`UPDATE roles SET permissions = permissions - 'tables.view' - 'tables.layout'`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS waiter_id`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS table_id`);
    await q(`DROP TABLE IF EXISTS dining_tables`);
    await q(`DROP TABLE IF EXISTS dining_areas`);
  },
};
