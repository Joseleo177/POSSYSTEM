'use strict';
const { Model } = require('sequelize');

// Una pieza entregada al taller para una orden. Al volver se anota cuánto se consumió y por
// qué; los retazos que regresan son piezas nuevas con parent_id = la entregada. Los cortes de
// la receta que cubre están en fabrication_order_cuts.
module.exports = (sequelize, DataTypes) => {
  class FabricationOrderPiece extends Model {
    static associate(models) {
      FabricationOrderPiece.belongsTo(models.FabricationOrder, { foreignKey: 'order_id' });
      FabricationOrderPiece.belongsTo(models.MaterialPiece, { as: 'piece', foreignKey: 'piece_id' });
    }
  }
  FabricationOrderPiece.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    order_id:     { type: DataTypes.INTEGER, allowNull: false },
    piece_id:     { type: DataTypes.INTEGER, allowNull: false },
    delivered_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    delivered_by: { type: DataTypes.INTEGER, allowNull: true },
    returned_at:  { type: DataTypes.DATE, allowNull: true },
    returned_by:  { type: DataTypes.INTEGER, allowNull: true },
    consumed:     { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    cost:         { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    note:         { type: DataTypes.TEXT, allowNull: true },
    // Cómo se picó al volver: { regions: [{ x, y, dx, dy, kind: 'usado'|'retazo', code }] } en mm.
    layout:       { type: DataTypes.JSONB, allowNull: true },
  }, {
    sequelize,
    tableName: 'fabrication_order_pieces',
    modelName: 'FabricationOrderPiece',
    timestamps: false,
  });
  return FabricationOrderPiece;
};
