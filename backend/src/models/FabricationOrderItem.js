'use strict';
const { Model } = require('sequelize');

// Accesorio gastado en una orden (tornillos, bisagras...). Sale del stock al anotarse, con el
// costo de la sucursal congelado en la línea.
module.exports = (sequelize, DataTypes) => {
  class FabricationOrderItem extends Model {
    static associate(models) {
      FabricationOrderItem.belongsTo(models.FabricationOrder, { foreignKey: 'order_id' });
      FabricationOrderItem.belongsTo(models.Product, { foreignKey: 'product_id' });
    }
  }
  FabricationOrderItem.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    order_id:     { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    product_name: { type: DataTypes.STRING(200), allowNull: false },
    quantity:     { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    unit_cost:    { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    employee_id:  { type: DataTypes.INTEGER, allowNull: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'fabrication_order_items',
    modelName: 'FabricationOrderItem',
    timestamps: false,
  });
  return FabricationOrderItem;
};
