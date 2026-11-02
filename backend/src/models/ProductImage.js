'use strict';
const { Model } = require('sequelize');

// Fotos adicionales de un producto (ver migración 20261104100000-product-images). La principal
// no está aquí: sigue en products.image_filename.
module.exports = (sequelize, DataTypes) => {
  class ProductImage extends Model {
    static associate(models) {}
  }
  ProductImage.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER, allowNull: false },
    product_id:     { type: DataTypes.INTEGER, allowNull: false },
    image_filename: { type: DataTypes.STRING(255), allowNull: false },
    label:          { type: DataTypes.STRING(60), allowNull: true },
    position:       { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'product_images',
    modelName: 'ProductImage',
    timestamps: false,
  });
  return ProductImage;
};
