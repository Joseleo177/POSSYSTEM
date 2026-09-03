'use strict';
const { Model } = require('sequelize');

// Un banner del carrusel de la vitrina pública. Es contenido de campaña que edita el
// comercio: no participa en ninguna operación de venta ni de inventario.
//
// Está en la lista de tenantModels de models/index.js, así que el filtro por empresa lo
// aplican los hooks; las consultas de aquí no llevan company_id a mano. Ojo con eso en las
// rutas públicas, que corren sin sesión: allá hay que envolver en tenantStorage.run() para
// que el filtro exista (ver publicCatalogService.js).
module.exports = (sequelize, DataTypes) => {
  class CatalogBanner extends Model {
    static associate(models) {}
  }
  CatalogBanner.init({
    id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Nombre interno para la lista de ajustes. No se publica.
    title: { type: DataTypes.STRING(120), allowNull: true },
    // Nombre de archivo (local) o URL completa (Supabase), igual que en Product.
    image_filename:        { type: DataTypes.STRING(500), allowNull: false },
    // Opcional: sin arte de móvil se usa el de escritorio.
    image_mobile_filename: { type: DataTypes.STRING(500), allowNull: true },
    link_url:   { type: DataTypes.STRING(500), allowNull: true },
    alt_text:   { type: DataTypes.STRING(200), allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'catalog_banners',
    modelName: 'CatalogBanner',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return CatalogBanner;
};
