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
      allowNull: false
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null
    },
    // Foto para la sección de categorías de la vitrina pública. Nombre de archivo en modo
    // local o URL completa en Supabase, igual que Product.image_filename.
    image_filename: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null
    },
    // Frase corta para el mosaico de "Tipos de comida" del tema de menú. Opcional.
    short_description: {
      type: DataTypes.STRING(160),
      allowNull: true,
      defaultValue: null
    }
  }, {
    sequelize,
    tableName: 'categories',
    modelName: 'Category',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['name', 'company_id']
      }
    ]
  });
  return Category;
};
