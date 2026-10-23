'use strict';

/**
 * Retazos con forma: al dibujar el corte, dos pedazos que se tocan pueden quedar como UNA pieza
 * (en el taller no se separaron). Si juntos no son un rectángulo —una L—, la pieza es
 * irregular pero se sabe su forma: `shape` son sus rectángulos en mm desde la esquina de su
 * contorno, y width_mm / length_mm guardan ese contorno. Con la forma se busca dónde cabe un
 * corte de verdad (dentro de alguna de sus partes) y se puede volver a dibujar al picarla.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE material_pieces ADD COLUMN IF NOT EXISTS shape JSONB`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE material_pieces DROP COLUMN IF EXISTS shape`);
  },
};
