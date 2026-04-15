'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Setting extends Model {
    static associate(models) {
      // no associations
    }
  }
  Setting.init({
    key: {
      type: DataTypes.STRING(100),
      primaryKey: true
    },
    value: DataTypes.TEXT,
    company_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false
    }
  }, {
    sequelize,
    tableName: 'settings',
    modelName: 'Setting',
    timestamps: false
  });
  return Setting;
};
