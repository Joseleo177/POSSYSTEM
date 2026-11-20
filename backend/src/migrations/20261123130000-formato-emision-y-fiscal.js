'use strict';

/**
 * Formato de emisión de comprobantes y módulo de Máquina Fiscal (The Factory HKA).
 * 
 * - companies.print_format: 'ticket' (Tickera 58/80mm), 'carta' (Hoja Carta / PDF), 'digital' (Solo digital / Sin impresión).
 * - companies.fiscal_enabled: habilita la emisión hacia impresoras fiscales físicas mediante NXUS Bridge.
 * - sales.fiscal_number: número de factura fiscal emitido por la máquina fiscal.
 * - sales.fiscal_serial: serial de la máquina fiscal que imprimió el documento.
 */
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS print_format VARCHAR(30) NOT NULL DEFAULT 'ticket';
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_enabled BOOLEAN NOT NULL DEFAULT false;

  ALTER TABLE sales ADD COLUMN IF NOT EXISTS fiscal_number VARCHAR(50);
  ALTER TABLE sales ADD COLUMN IF NOT EXISTS fiscal_serial VARCHAR(50);
`;

const SQL_DOWN = `
  ALTER TABLE sales DROP COLUMN IF EXISTS fiscal_serial;
  ALTER TABLE sales DROP COLUMN IF EXISTS fiscal_number;

  ALTER TABLE companies DROP COLUMN IF EXISTS fiscal_enabled;
  ALTER TABLE companies DROP COLUMN IF EXISTS print_format;
`;

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(SQL_UP);
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(SQL_DOWN);
  }
};
