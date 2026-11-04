'use strict';

/**
 * Historial de tasas de cambio.
 *
 * currencies.exchange_rate se pisaba en cada actualización y no quedaba rastro de la tasa de
 * días anteriores. Un cobro que se registra tarde (el cobrador de calle que pasa los abonos
 * días después, 04-11-2026) tiene que ir a la tasa del DÍA DEL PAGO, no a la de hoy, y para
 * eso hace falta saber cuál era.
 *
 * Una fila por empresa, moneda y día: la tasa con la que el negocio cobró ese día. Los días
 * sin fila (fines de semana, días en que nadie la tocó) heredan la del último día anterior.
 *
 * El pasado se reconstruye con lo ya registrado: ventas y cobros guardan la tasa con la que se
 * hicieron. Se toma la más usada de cada día —un cobro con tasa escrita a mano no la mueve— y
 * se dejan fuera los cobros de facturas con tasa de divisas, que no son la tasa del día.
 */
const SQL_UP = `
  CREATE TABLE IF NOT EXISTS currency_rates (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    rate_date   DATE NOT NULL,
    rate        DECIMAL(14, 6) NOT NULL CHECK (rate > 0),
    -- 'bcv', 'er-api', 'manual' (Monedas o el aviso del BCV), 'registro' (reconstruida de
    -- ventas y cobros) o 'correccion' (editada después en el historial).
    source      VARCHAR(20) NOT NULL DEFAULT 'manual',
    employee_id INTEGER,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS currency_rates_company_currency_date
    ON currency_rates (company_id, currency_id, rate_date);
  -- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
  ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

  INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source)
  SELECT DISTINCT ON (company_id, currency_id, d) company_id, currency_id, d, r, 'registro'
    FROM (
      SELECT company_id, currency_id, d, r, COUNT(*) AS n, MAX(at) AS ultimo
        FROM (
          SELECT p.company_id, p.currency_id, (p.created_at AT TIME ZONE 'America/Caracas')::date AS d,
                 ROUND(p.exchange_rate, 6) AS r, p.created_at AS at
            FROM payments p
            JOIN currencies c ON c.id = p.currency_id AND NOT c.is_base
            JOIN sales s ON s.id = p.sale_id
           WHERE p.exchange_rate > 1 AND COALESCE(s.fx_rate, 0) = 0
          UNION ALL
          SELECT s.company_id, s.currency_id, (s.created_at AT TIME ZONE 'America/Caracas')::date,
                 ROUND(s.exchange_rate, 6), s.created_at
            FROM sales s
            JOIN currencies c ON c.id = s.currency_id AND NOT c.is_base
           WHERE s.exchange_rate > 1
        ) usos
       WHERE company_id IS NOT NULL
       GROUP BY company_id, currency_id, d, r
    ) dias
   WHERE d < (NOW() AT TIME ZONE 'America/Caracas')::date
   ORDER BY company_id, currency_id, d, n DESC, ultimo DESC
  ON CONFLICT (company_id, currency_id, rate_date) DO NOTHING;

  -- Hoy manda la tasa cargada en este momento.
  INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source)
  SELECT company_id, id, (NOW() AT TIME ZONE 'America/Caracas')::date, exchange_rate, 'manual'
    FROM currencies
   WHERE NOT is_base AND company_id IS NOT NULL AND exchange_rate > 0
  ON CONFLICT (company_id, currency_id, rate_date) DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW();
`;

module.exports = {

  async up(queryInterface) {
    await queryInterface.sequelize.query(SQL_UP);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS currency_rates;');
  },
};
