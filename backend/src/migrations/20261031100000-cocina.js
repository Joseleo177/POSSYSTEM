'use strict';

// Pantalla de cocina (KDS) para restaurantes. En el restaurante que la pidió los mesoneros
// toman el pedido en una tablet desde el catálogo público: ese pedido ES la comanda. Aquí se
// guarda en qué punto de la cocina va cada uno, sobre la venta misma —no en una tabla
// aparte—, porque el pedido conserva su id al aceptarlo y al cobrarlo, y cada ronda de una
// mesa ya llega como un pedido distinto.
//
// kitchen_status: NULL (no pasa por cocina) · nueva · preparando · lista · entregada.
// kitchen_status_at es la hora del último cambio; kitchen_ready_at, la de "lista", queda
// guardada para medir tiempos de preparación más adelante.
//
// El módulo lo enciende el superusuario por empresa (companies.cocina_enabled), como Fábrica.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS cocina_enabled BOOLEAN NOT NULL DEFAULT false`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_status VARCHAR(12)`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_status_at TIMESTAMPTZ`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ`);
    // El tablero se consulta cada pocos segundos desde cada pantalla de cocina: el índice
    // parcial solo guarda las comandas vivas, así que no crece con el historial de ventas.
    await q(`CREATE INDEX IF NOT EXISTS sales_kitchen_activas
               ON sales (company_id, kitchen_status)
            WHERE kitchen_status IN ('nueva', 'preparando', 'lista')`);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX IF EXISTS sales_kitchen_activas`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS kitchen_ready_at`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS kitchen_status_at`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS kitchen_status`);
    await q(`ALTER TABLE companies DROP COLUMN IF EXISTS cocina_enabled`);
  },
};
