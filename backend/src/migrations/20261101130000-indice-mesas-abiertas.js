'use strict';

// Índice de las cuentas ABIERTAS por mesa. La página del QR de la mesa y su huella preguntan
// "¿qué cuenta abierta tiene esta mesa?" cada 15 s por teléfono; sin índice por table_id eso
// recorría las ventas de la empresa. Es parcial: solo guarda las cuentas en espera, borrador o
// pedido (las mesas ocupadas en este momento), así que no crece con el historial y se crea al
// instante aunque sales sea grande.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS sales_mesa_abiertas ON sales (table_id)
       WHERE table_id IS NOT NULL AND status IN ('espera', 'borrador', 'pedido')`);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS sales_mesa_abiertas`);
  },
};
