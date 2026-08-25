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
    // price iguala a sale_items.price (14,5), que es de donde se copia; subtotal va a 6
    // decimales como el total de la nota.
    price: { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    qty: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    tableName: 'return_items',
    modelName: 'ReturnItem',
    timestamps: false
  });
  return ReturnItem;
};
