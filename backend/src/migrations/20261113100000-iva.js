'use strict';

// IVA, fase 1 (05-11-2026). Ver services/fiscal/iva.js.
//
// companies.iva_enabled: la empresa factura con IVA. Apagado por defecto: lo enciende el
// superusuario por empresa, como los demás extras.
//
// products.iva_tipo: la alícuota del producto. G = general (16 %), R = reducida (8 %),
// A = general más la adicional de lujo (31 %), E = exento. Todo arranca en G: la tienda marca
// los exentos.
//
// sale_items.iva_rate: la alícuota de la línea, congelada al crearla, como cost_price. Null en
// las líneas de una empresa sin IVA (y en todas las de antes). Los precios incluyen el IVA: esta
// columna no cambia ningún monto, solo dice cómo se desglosa.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE companies  ADD COLUMN IF NOT EXISTS iva_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE products   ADD COLUMN IF NOT EXISTS iva_tipo VARCHAR(1) NOT NULL DEFAULT 'G';
      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_iva_tipo_check') THEN
          ALTER TABLE products ADD CONSTRAINT products_iva_tipo_check CHECK (iva_tipo IN ('G', 'R', 'A', 'E'));
        END IF;
      END $$;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE products   DROP CONSTRAINT IF EXISTS products_iva_tipo_check;
      ALTER TABLE sale_items DROP COLUMN IF EXISTS iva_rate;
      ALTER TABLE products   DROP COLUMN IF EXISTS iva_tipo;
      ALTER TABLE companies  DROP COLUMN IF EXISTS iva_enabled;
    `);
  },
};
