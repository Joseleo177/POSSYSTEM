'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReturnItem extends Model {
    static associate(models) {}
  }
  ReturnItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    return_id: { type: DataTypes.INTEGER, allowNull: false },
    sale_item_id: { type: DataTypes.INTEGER },
    product_id: { type: DataTypes.INTEGER },
    name: { type: DataTypes.STRING(300), allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    qty: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
  }, {
    sequelize,
    tableName: 'return_items',
    modelName: 'ReturnItem',
    timestamps: false
  });
  return ReturnItem;
};
