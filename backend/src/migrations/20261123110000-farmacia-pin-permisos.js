'use strict';

/**
 * Farmacia — PIN de autorización farmacéutica y trazabilidad de aprobación.
 *
 *  - employees.approval_pin_hash: PIN rápido (4–6 dígitos, bcrypt) del Farmacéutico Regente o
 *    supervisor para autorizar ventas de medicamentos controlados / con récipe en caja.
 *  - sale_prescriptions.approved_by / approved_at: qué empleado con permiso
 *    `pharmacy.approve_controlled` supervisó y autorizó el despacho.
 */
const SQL_UP = `
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS approval_pin_hash VARCHAR(255);
  ALTER TABLE sale_prescriptions ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
  ALTER TABLE sale_prescriptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
`;

const SQL_DOWN = `
  ALTER TABLE sale_prescriptions DROP COLUMN IF EXISTS approved_at;
  ALTER TABLE sale_prescriptions DROP COLUMN IF EXISTS approved_by;
  ALTER TABLE employees DROP COLUMN IF EXISTS approval_pin_hash;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
