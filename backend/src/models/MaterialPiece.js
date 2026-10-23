'use strict';
const { Model } = require('sequelize');

// Una pieza numerada de un material por piezas, o un retazo que salió de ella (ver migración
// 20261023100000-fabrica). La existencia del material sigue en product_stock; la pieza dice
// qué cantidad concreta hay y dónde. `size` va en la unidad del producto: m² o m.
module.exports = (sequelize, DataTypes) => {
  class MaterialPiece extends Model {
    static associate(models) {
      MaterialPiece.belongsTo(models.Product,   { foreignKey: 'product_id' });
      MaterialPiece.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
      MaterialPiece.belongsTo(models.Employee,  { foreignKey: 'employee_id' });
      MaterialPiece.belongsTo(MaterialPiece, { as: 'parent',   foreignKey: 'parent_id' });
      MaterialPiece.hasMany(MaterialPiece,   { as: 'children', foreignKey: 'parent_id' });
    }
  }
  MaterialPiece.init({
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:       { type: DataTypes.INTEGER, allowNull: true },
    product_id:       { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id:     { type: DataTypes.INTEGER, allowNull: false },
    code:             { type: DataTypes.STRING(40), allowNull: false },
    root_number:      { type: DataTypes.INTEGER, allowNull: false },
    parent_id:        { type: DataTypes.INTEGER, allowNull: true },
    width_mm:         { type: DataTypes.INTEGER, allowNull: true },
    length_mm:        { type: DataTypes.INTEGER, allowNull: true },
    is_irregular:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Irregular con forma conocida (retazo en L): sus rectángulos [{ x, y, dx, dy }] en mm desde
    // la esquina de su contorno, que va en width_mm × length_mm.
    shape:            { type: DataTypes.JSONB, allowNull: true },
    size:             { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    unit_cost:        { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    status:           { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'disponible' },
    origin:           { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'compra' },
    source_order_id:  { type: DataTypes.INTEGER, allowNull: true },
    purchase_item_id: { type: DataTypes.INTEGER, allowNull: true },
    reference:        { type: DataTypes.STRING(80), allowNull: true },
    notes:            { type: DataTypes.TEXT, allowNull: true },
    employee_id:      { type: DataTypes.INTEGER, allowNull: true },
    closed_at:        { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    tableName: 'material_pieces',
    modelName: 'MaterialPiece',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return MaterialPiece;
};
