'use strict';

// Comandas por ronda. Hasta aquí la comanda era la cuenta entera (sales.kitchen_status): servía
// para el pedido del catálogo, que llega de una vez, pero no para una mesa a la que el mesonero
// le va sumando rondas. Ahora cada envío a cocina es una comanda con SUS líneas, y la cocina ve
// solo lo nuevo. sales.kitchen_status queda como resumen de las comandas de la cuenta (lo que
// la caja marca "En cocina" / "Lista").
//
// Además:
// - Permiso `tables.serve` (tomar pedidos en las mesas) y el rol Mesonero, que solo ve el mapa
//   y toma pedidos: los mesoneros NO cobran ni abren caja. El rol se crea como plantilla y se
//   copia a las empresas con restaurante; al encender Restaurante en otra, se copia ahí
//   (controllers/companies.js).
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
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

      CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
        id         SERIAL PRIMARY KEY,
        ticket_id  INTEGER NOT NULL REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
        product_id INTEGER,
        name       VARCHAR(255) NOT NULL,
        quantity   NUMERIC(12, 3) NOT NULL,
        note       VARCHAR(200)
      );
      CREATE INDEX IF NOT EXISTS kitchen_ticket_items_ticket ON kitchen_ticket_items (ticket_id);
    `);

    // Las comandas vivas del esquema anterior pasan a ser la ronda 1 de su cuenta.
    await q(`
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
    `);

    // Rol Mesonero: plantilla y copia en cada empresa con restaurante.
    await q(`
      INSERT INTO roles (name, label, permissions, company_id)
      SELECT 'waiter', 'Mesonero', '{"tables.view": true, "tables.serve": true}'::jsonb, NULL
       WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'waiter' AND company_id IS NULL);
      INSERT INTO roles (name, label, permissions, company_id)
      SELECT 'waiter', 'Mesonero', '{"tables.view": true, "tables.serve": true}'::jsonb, c.id
        FROM companies c
       WHERE c.cocina_enabled
         AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = 'waiter' AND r.company_id = c.id);
    `);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DELETE FROM roles WHERE name = 'waiter' AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.role_id = roles.id)`);
    await q(`DROP TABLE IF EXISTS kitchen_ticket_items`);
    await q(`DROP TABLE IF EXISTS kitchen_tickets`);
  },
};
