'use strict';

/**
 * Módulo de Farmacia (`farmacia_enabled`).
 *
 *  - companies.farmacia_enabled: activa el módulo de farmacia para la empresa. Apagado = sin cambios.
 *  - products: ficha farmacéutica (principio activo, concentración, acción terapéutica, anaquel,
 *    tipo de récipe) + precio general por caja (`box_price`, reutilizando `package_unit` y
 *    `package_size`).
 *  - product_stock.box_price: precio por caja por sucursal (NULL = hereda `products.box_price`).
 *  - sale_items.stock_factor y unit_label: cuando se vende por caja, `stock_factor = package_size`
 *    para descontar y reponer exactamente las unidades mínimas del inventario sin decimales.
 *  - sale_prescriptions: foto del récipe + datos del paciente y médico vinculados a la venta.
 */
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS farmacia_enabled BOOLEAN NOT NULL DEFAULT false;

  ALTER TABLE products ADD COLUMN IF NOT EXISTS active_ingredient VARCHAR(200);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS concentration VARCHAR(80);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS therapeutic_action VARCHAR(120);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(60);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS prescription_type VARCHAR(20) NOT NULL DEFAULT 'libre';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS box_price DECIMAL(14,5);

  CREATE INDEX IF NOT EXISTS idx_products_active_ingredient
    ON products (company_id, LOWER(active_ingredient))
    WHERE active_ingredient IS NOT NULL;

  ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS box_price DECIMAL(14,5);

  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS stock_factor DECIMAL(10,3) NOT NULL DEFAULT 1;
  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_label VARCHAR(40);

  CREATE TABLE IF NOT EXISTS sale_prescriptions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    patient_name VARCHAR(150) NOT NULL,
    patient_id_doc VARCHAR(30) NOT NULL,
    doctor_name VARCHAR(150) NOT NULL,
    doctor_license VARCHAR(50),
    prescription_number VARCHAR(60),
    photo_filename VARCHAR(255),
    prescription_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sale_prescriptions_company_sale
    ON sale_prescriptions (company_id, sale_id);
  CREATE INDEX IF NOT EXISTS idx_sale_prescriptions_company_created
    ON sale_prescriptions (company_id, created_at DESC);
`;

const SQL_DOWN = `
  DROP TABLE IF EXISTS sale_prescriptions;
  ALTER TABLE sale_items DROP COLUMN IF EXISTS unit_label;
  ALTER TABLE sale_items DROP COLUMN IF EXISTS stock_factor;
  ALTER TABLE product_stock DROP COLUMN IF EXISTS box_price;
  DROP INDEX IF EXISTS idx_products_active_ingredient;
  ALTER TABLE products DROP COLUMN IF EXISTS box_price;
  ALTER TABLE products DROP COLUMN IF EXISTS prescription_type;
  ALTER TABLE products DROP COLUMN IF EXISTS shelf_location;
  ALTER TABLE products DROP COLUMN IF EXISTS therapeutic_action;
  ALTER TABLE products DROP COLUMN IF EXISTS concentration;
  ALTER TABLE products DROP COLUMN IF EXISTS active_ingredient;
  ALTER TABLE companies DROP COLUMN IF EXISTS farmacia_enabled;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
