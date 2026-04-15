'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentMethod extends Model {
    static associate(models) { }
  }
  PaymentMethod.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    color: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#555555' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'payment_methods',
    modelName: 'PaymentMethod',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['name', 'company_id']
      },
      {
        unique: true,
        fields: ['code', 'company_id']
      }
    ]
  });
  return PaymentMethod;
};
