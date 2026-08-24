'use strict';

// Rellena la fecha de documento de los ingresos y egresos que quedaron sin ella.
//
// Varios movimientos se creaban desde código sin pasar `date`: el vuelto de un cobro y el pago
// a proveedor, entre otros. Al quedar en NULL, el estado de cuenta los ordenaba por su
// `created_at` —un instante con hora— mientras el resto de los movimientos va a la medianoche
// de su día, y aparecían descolocados frente a los documentos que los originaron.
//
// Se les pone la medianoche local del día en que se registraron, que es su fecha contable
// real: son movimientos automáticos, generados en el mismo acto que su documento.
//
// Idempotente: solo toca filas con `date` en NULL, así que correrla dos veces no mueve nada.
// La zona va explícita y no se hereda del proceso, igual que en utils/localDate.js: en Vercel
// el runtime corre en UTC y `::date` a secas cortaría el día cuatro horas antes.
const TZ = process.env.DB_TIMEZONE || 'America/Caracas';

module.exports = {
  async up(queryInterface) {
    for (const tabla of ['incomes', 'expenses']) {
      await queryInterface.sequelize.query(`
        UPDATE ${tabla}
           SET date = ((created_at AT TIME ZONE '${TZ}')::date::timestamp AT TIME ZONE '${TZ}')
         WHERE date IS NULL
      `);
    }
  },

  async down() {
    // No se revierte: volver a poner NULL perdería la fecha contable de esos movimientos y
    // devolvería el desorden en el estado de cuenta. La columna admite NULL, así que nada
    // depende de que estos registros lo estén.
  },
};
