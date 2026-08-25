'use strict';

// `incomes.created_at` pasa a llevar zona horaria, como el resto de las tablas de dinero.
//
// Era la única `timestamp without time zone`: `payments.created_at`, `expenses.created_at` y
// `expenses.date` son todas `timestamptz`. Mientras nadie comparara ingresos con el reloj daba
// igual, pero el arqueo de caja empezó a contarlos —lo que entra a la gaveta a mano también hay
// que cuadrarlo— y ahí sí importa: la sesión se acota entre dos instantes UTC, y un timestamp
// sin zona se compara contra ellos como si el valor guardado ya estuviera en UTC. Con el
// backend corriendo en Caracas (UTC-4) el ingreso de las 08:56 se leía como las 08:56 UTC —las
// 04:56 de la mañana local— y quedaba fuera del turno que lo registró.
//
// La conversión asume que lo guardado está en hora de Caracas, que es la zona del negocio y la
// que usa el contenedor (TZ en docker-compose). Solo mueve el sello de auditoría del registro:
// la fecha contable del ingreso vive en `incomes.date`, que ya era timestamptz y no se toca.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE incomes
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'America/Caracas'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE incomes
        ALTER COLUMN updated_at TYPE timestamptz
        USING updated_at AT TIME ZONE 'America/Caracas'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE incomes
        ALTER COLUMN created_at TYPE timestamp
        USING created_at AT TIME ZONE 'America/Caracas'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE incomes
        ALTER COLUMN updated_at TYPE timestamp
        USING updated_at AT TIME ZONE 'America/Caracas'
    `);
  },
};
