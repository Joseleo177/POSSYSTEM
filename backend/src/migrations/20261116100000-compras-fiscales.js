'use strict';

// Compras y gastos fiscales (IVA, etapa 1 del Libro de compras, 10-11-2026). Ver
// services/purchases/fiscalCompra.js y services/reports/libroComprasReport.js.
//
// purchases: la factura del proveedor. `fiscal` = trae factura fiscal (con IVA y al libro); sin ella
// es una nota de entrega o una compra informal y nada cambia. RIF, número, control y fecha son los
// del papel del proveedor. `iva_amount` es el IVA en moneda base (entra al total que se le debe);
// `iva_adjust` es la corrección a mano, en la moneda de la factura, para que el IVA diga lo mismo
// que el papel del proveedor cuando redondeó distinto.
//
// purchase_items.iva_rate: la alícuota de la línea (la del producto, cambiable). Null = sin factura.
//
// purchase_charges: "otros cargos" de la misma factura (flete, transporte, servicio): no tocan
// inventario, llevan su categoría de gasto y su alícuota. Así una factura mixta es un solo
// documento y una sola fila del libro.
//
// expenses: el mismo bloque para un gasto con factura (luz, alquiler). `iva_amount` va en la moneda
// del gasto (amount × rate), que es la del papel.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS fiscal BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_rif VARCHAR(20);
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(40);
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_control_number VARCHAR(40);
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS iva_amount NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS iva_adjust NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);

      CREATE TABLE IF NOT EXISTS purchase_charges (
        id                  SERIAL PRIMARY KEY,
        company_id          INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        purchase_id         INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        description         VARCHAR(200) NOT NULL,
        amount              NUMERIC(14, 6) NOT NULL,
        iva_rate            NUMERIC(5, 2),
        expense_category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS purchase_charges_purchase ON purchase_charges (purchase_id);

      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fiscal BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_rif VARCHAR(20);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS control_number VARCHAR(40);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_date DATE;
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS iva_amount NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(14, 2);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE expenses DROP COLUMN IF EXISTS invoice_total, DROP COLUMN IF EXISTS iva_amount, DROP COLUMN IF EXISTS iva_rate,
        DROP COLUMN IF EXISTS invoice_date, DROP COLUMN IF EXISTS control_number,
        DROP COLUMN IF EXISTS invoice_number, DROP COLUMN IF EXISTS supplier_name,
        DROP COLUMN IF EXISTS supplier_rif, DROP COLUMN IF EXISTS fiscal;
      DROP TABLE IF EXISTS purchase_charges;
      ALTER TABLE purchase_items DROP COLUMN IF EXISTS iva_rate;
      ALTER TABLE purchases DROP COLUMN IF EXISTS iva_adjust, DROP COLUMN IF EXISTS iva_amount,
        DROP COLUMN IF EXISTS supplier_invoice_date, DROP COLUMN IF EXISTS supplier_control_number,
        DROP COLUMN IF EXISTS supplier_invoice_number, DROP COLUMN IF EXISTS supplier_rif,
        DROP COLUMN IF EXISTS fiscal;
    `);
  },
};
