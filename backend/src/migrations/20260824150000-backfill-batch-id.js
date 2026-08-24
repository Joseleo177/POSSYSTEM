'use strict';

// Reagrupa los cobros conjuntos que ya se hicieron antes de existir `batch_id`.
//
// Esos pagos quedaron con la marca en dos sitios: la nota "Cobro conjunto de N facturas" y una
// clave de idempotencia con el formato `<uuid del lote>-<id de la venta>`. Recortando el
// sufijo numérico se recupera el lote al que pertenecían, y la caja pasa a mostrarlos como el
// único movimiento que fueron en vez de una línea por factura.
//
// Solo toca filas que cumplen las DOS condiciones —nota de cobro conjunto y clave con sufijo
// numérico—; un cobro corriente no las cumple y se queda como está.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE payments
         SET batch_id = LEFT(regexp_replace(idempotency_key, '-[0-9]+$', ''), 64)
       WHERE batch_id IS NULL
         AND idempotency_key ~ '-[0-9]+$'
         AND notes LIKE '%Cobro conjunto de%'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE payments SET batch_id = NULL WHERE notes LIKE '%Cobro conjunto de%'
    `);
  },
};
