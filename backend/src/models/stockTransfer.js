'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransfer extends Model {
    static associate(models) {
      StockTransfer.belongsTo(models.Warehouse, { as: 'FromWarehouse', foreignKey: 'from_warehouse_id' });
      StockTransfer.belongsTo(models.Warehouse, { as: 'ToWarehouse', foreignKey: 'to_warehouse_id' });
      StockTransfer.belongsTo(models.Product, { foreignKey: 'product_id' });
      StockTransfer.belongsTo(models.Employee, { foreignKey: 'employee_id' });
    }
  }
  StockTransfer.init({
    from_warehouse_id: DataTypes.INTEGER,
    to_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: DataTypes.INTEGER,
    product_name: {
      type: DataTypes.VARCHAR(200),
      allowNull: false
    },
    qty: {
      type: DataTypes.NUMERIC(10, 3),
      allowNull: false
    },
    note: DataTypes.TEXT,
    employee_id: DataTypes.INTEGER
  }, {
    sequelize,
    tableName: 'stock_transfers',
    modelName: 'StockTransfer',
    updatedAt: false
  });
  return StockTransfer;
};
