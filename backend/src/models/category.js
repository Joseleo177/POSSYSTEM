'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Category extends Model {
    static associate(models) {
      // define association here if needed later (e.g. Category.hasMany(models.Product))
    }
  }
  Category.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    }
  }, {
    sequelize,
    tableName: 'categories',
    modelName: 'Category',
    timestamps: false
  });
  return Category;
};
