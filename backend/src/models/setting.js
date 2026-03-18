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
    value: DataTypes.TEXT
  }, {
    sequelize,
    tableName: 'settings',
    modelName: 'Setting',
    timestamps: false
  });
  return Setting;
};
