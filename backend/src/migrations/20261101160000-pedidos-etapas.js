'use strict';

// Etapas del pedido web después de aceptarlo, y qué productos pasan por cocina.
//
// Antes, con la cocina encendida, TODO pedido del catálogo entraba al tablero de cocina en
// cuanto el cliente lo enviaba, y el módulo Pedidos terminaba en "Aceptar". El usuario lo
// explicó así: una tienda de empanadas solo embolsa, y una que vende comida y productos ya
// hechos no tiene por qué mandar el refresco a cocina; y después de aceptar falta cobrar,
// facturar, enviar y entregar.
//
// - products.kitchen_prep: el producto se prepara en cocina. Al aceptar un pedido, sus líneas
//   salen marcadas para la comanda (y se pueden cambiar). En las empresas que ya tenían cocina
//   se marca todo lo vendible que no es adicional: así siguen igual que antes hasta que
//   desmarquen lo que no se prepara.
// - sales.fulfillment_status: aceptado → listo → en_camino (solo delivery) → entregado.
//   NULL = no es un pedido web o todavía no se acepta. El cobro y la factura no van aquí:
//   salen del status de la venta y de su número de factura, como siempre.
// - Los pedidos web ya aceptados antes de esto quedan 'entregado': si no, "En curso"
//   arrancaría con todo el historial.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS kitchen_prep BOOLEAN NOT NULL DEFAULT false`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(12)`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment_status_at TIMESTAMPTZ`);
    await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`);

    await q(`UPDATE products p SET kitchen_prep = true
               FROM companies c
              WHERE c.id = p.company_id AND c.cocina_enabled AND NOT p.is_addon AND NOT p.kitchen_prep`);
    await q(`UPDATE sales SET fulfillment_status = 'entregado', fulfillment_status_at = NOW()
              WHERE web_customer_name IS NOT NULL AND status <> 'pedido' AND fulfillment_status IS NULL`);

    // "En curso" se consulta cada pocos segundos desde el módulo Pedidos: el índice parcial
    // solo guarda los pedidos web vivos, así que no crece con el historial.
    await q(`CREATE INDEX IF NOT EXISTS sales_pedidos_en_curso
               ON sales (company_id, created_at)
            WHERE web_customer_name IS NOT NULL AND fulfillment_status IN ('aceptado', 'listo', 'en_camino')`);
  },
  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`DROP INDEX IF EXISTS sales_pedidos_en_curso`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS delivered_at`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS fulfillment_status_at`);
    await q(`ALTER TABLE sales DROP COLUMN IF EXISTS fulfillment_status`);
    await q(`ALTER TABLE products DROP COLUMN IF EXISTS kitchen_prep`);
  },
};
