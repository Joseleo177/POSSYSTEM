'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductStock extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  ProductStock.init({
    warehouse_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: 'warehouses', key: 'id' }
    },
    product_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: 'products', key: 'id' }
    },
    qty: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0
    },
    // La fila no es solo existencias: es la ficha del producto en esa sucursal. Precio y
    // mínimo propios viven acá, y NULL —no 0— significa "hereda del producto": un 0 sería un
    // precio de cero y un mínimo de cero, que son valores legítimos y distintos de "sin
    // definir".
    price: {
      type: DataTypes.DECIMAL(14, 5),
      allowNull: true
    },
    min_stock: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true
    },
    // El costo no se escribe a mano: lo fija la mercancía al entrar —una compra recibida aquí
    // o una transferencia que llega— con el mismo criterio de "último costo" que ya usa el
    // producto. NULL mientras esta sucursal no haya recibido nada de él.
    cost_price: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'product_stock',
    modelName: 'ProductStock',
    timestamps: false
  });
  return ProductStock;
};
