'use strict';

// Ajuste de precios al empezar a facturar con IVA (13-11-2026). Una empresa que enciende el IVA tiene
// precios que no lo llevan: un producto de $1,00 tiene que pasar a $1,16 o el impuesto sale de su
// ganancia. Catálogo → IVA → Precios suma (o quita) el IVA de una vez a todos los precios de venta, y
// cada ajuste se guarda aquí con el antes y el después de cada precio para poder deshacerlo exacto.
// Ver services/fiscal/preciosIva.js.
//
// direccion: 'sumar' (×1,16) o 'quitar' (÷1,16). redondeo: 'exacto', 'centimo', '0.05', '0.10',
// '0.50' o '1'. cambios: [{ t: 'p' | 's', id, w?, f, a, d }] — tabla (producto o ficha de sucursal),
// producto, almacén, campo, antes y después.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS iva_price_adjustments (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        direccion    VARCHAR(6) NOT NULL,
        redondeo     VARCHAR(8) NOT NULL DEFAULT 'exacto',
        alcance      JSONB,
        productos    INTEGER NOT NULL DEFAULT 0,
        cambios      JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deshecho_at  TIMESTAMPTZ,
        deshecho_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS iva_price_adjustments_company ON iva_price_adjustments (company_id, id DESC);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS iva_price_adjustments`);
  },
};
