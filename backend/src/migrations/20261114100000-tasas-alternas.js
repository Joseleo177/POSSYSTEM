'use strict';

/**
 * Moneda local explícita y tasas alternas (06-11-2026).
 *
 * 1. currencies.is_local: la moneda que la pantalla muestra junto a la base (los bolívares). Antes
 *    se tomaba "la primera divisa que no es la base", y las monedas salen ordenadas por código:
 *    agregar pesos (COP) o cualquier código antes de "VES" ponía esa moneda en lugar de los Bs en
 *    el carrito, el cobro y los tickets. Una sola por empresa.
 *
 * 2. currencies.rate_of_id: tasa alterna de una moneda. Hay comercios que cobran los bolívares a
 *    la tasa USDT (1100) además de a la del BCV (880): un producto de $10 son Bs 11.000 o
 *    Bs 8.800 según el método. La tasa USDT es una fila más de currencies con el mismo código y
 *    rate_of_id = el bolívar; así tiene su tarjeta en Monedas, su historial en currency_rates y
 *    los cobros la guardan en payments.currency_id / exchange_rate como cualquier otra moneda.
 *    El código deja de ser único entre las tasas alternas (sigue siéndolo entre las monedas).
 *    currencies.auto_sync: "Sincronizar tasas" solo toca las que la tienda no pone a mano.
 *
 * 3. payment_journal_methods.rate_currency_id: con qué moneda o tasa cobra por defecto ese método
 *    de esa caja (pago móvil a USDT, punto a BCV). Vacío = la moneda de la caja, como siempre.
 */
const SQL_UP = `
  ALTER TABLE currencies ADD COLUMN IF NOT EXISTS is_local BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE currencies ADD COLUMN IF NOT EXISTS rate_of_id INTEGER REFERENCES currencies(id) ON DELETE CASCADE;
  -- Se actualiza sola con "Sincronizar tasas". Apagada en las tasas que pone la tienda (USDT, pesos de frontera).
  ALTER TABLE currencies ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN NOT NULL DEFAULT true;

  DROP INDEX IF EXISTS currencies_code_company_id_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS currencies_code_company_id_unique
    ON currencies (code, company_id) WHERE rate_of_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS currencies_alterna_nombre
    ON currencies (rate_of_id, name) WHERE rate_of_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS currencies_una_local
    ON currencies (company_id) WHERE is_local;

  -- La local de cada empresa: su bolívar, o la divisa más vieja si no tiene.
  UPDATE currencies SET is_local = true
   WHERE id IN (
     SELECT DISTINCT ON (company_id) id FROM currencies
      WHERE NOT is_base AND rate_of_id IS NULL
      ORDER BY company_id, (code <> 'VES'), id
   )
     AND NOT EXISTS (SELECT 1 FROM currencies x WHERE x.company_id = currencies.company_id AND x.is_local);

  ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS rate_currency_id INTEGER
    REFERENCES currencies(id) ON DELETE SET NULL;
`;

const SQL_DOWN = `
  ALTER TABLE payment_journal_methods DROP COLUMN IF EXISTS rate_currency_id;
  DELETE FROM currencies WHERE rate_of_id IS NOT NULL;
  DROP INDEX IF EXISTS currencies_una_local;
  DROP INDEX IF EXISTS currencies_alterna_nombre;
  DROP INDEX IF EXISTS currencies_code_company_id_unique;
  CREATE UNIQUE INDEX currencies_code_company_id_unique ON currencies (code, company_id);
  ALTER TABLE currencies DROP COLUMN IF EXISTS rate_of_id;
  ALTER TABLE currencies DROP COLUMN IF EXISTS auto_sync;
  ALTER TABLE currencies DROP COLUMN IF EXISTS is_local;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
