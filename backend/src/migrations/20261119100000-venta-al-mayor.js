'use strict';

/**
 * Venta al mayor (12-11-2026). Fase 2 del plan: los datos. La caja todavía no los usa (fase 3).
 *
 * Reglas decididas con el usuario:
 *  - Se cobra al mayor si el cliente es MAYORISTA o si la línea llega a la cantidad mínima del
 *    producto (cualquiera de las dos). Promoción y precio al mayor NO se acumulan.
 *  - Precio al mayor y mínimo son POR SUCURSAL, con la misma herencia que el precio detal:
 *    `product_stock.*` NULL = hereda de `products.*`.
 *  - Variantes: la cantidad suma todo el modelo; precio al mayor y mínimo se copian del modelo.
 *
 * companies.mayor_enabled: la empresa vende al mayor. Apagado = nada de esto aparece ni cambia.
 * products.wholesale_min_qty: "al mayor desde" N unidades (o kg, litros...). NULL = la cantidad
 *   no da precio al mayor: solo lo recibe el cliente mayorista.
 * customers.price_level: 'detal' | 'mayor'.
 */
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS mayor_enabled BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_min_qty DECIMAL(10,3);
  ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(14,5);
  ALTER TABLE product_stock ADD COLUMN IF NOT EXISTS wholesale_min_qty DECIMAL(10,3);
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_level VARCHAR(10) NOT NULL DEFAULT 'detal';
`;

const SQL_DOWN = `
  ALTER TABLE customers DROP COLUMN IF EXISTS price_level;
  ALTER TABLE product_stock DROP COLUMN IF EXISTS wholesale_min_qty;
  ALTER TABLE product_stock DROP COLUMN IF EXISTS wholesale_price;
  ALTER TABLE products DROP COLUMN IF EXISTS wholesale_min_qty;
  ALTER TABLE companies DROP COLUMN IF EXISTS mayor_enabled;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
