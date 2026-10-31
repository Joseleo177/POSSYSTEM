'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      // Definir asociaciones aquí si es necesario
    }
  }
  Company.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    tax_id: { type: DataTypes.STRING(50), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    logo_url: { type: DataTypes.STRING(255), allowNull: true },
    plan_name: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Básico' },
    subscription_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Demo' },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    max_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    // Extra que solo el superusuario enciende por empresa (ver Gestión de Empresas). No es
    // un ajuste de la propia empresa: aunque configure tema, banners y slug, el catálogo no
    // responde en público mientras esto siga en false (ver resolveCompanyId en
    // publicCatalogService).
    catalog_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Módulo Fábrica (láminas y órdenes de fabricación). Igual que la vitrina: lo enciende
    // el superusuario para la empresa que lo contrata.
    fabrica_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Pantalla de cocina para restaurantes (ver routes/kitchen.js). Mismo criterio: un extra
    // que el superusuario enciende.
    cocina_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Pedidos del catálogo con delivery y pago reportado (ver services/catalogCheckout.js). Un
    // extra más, y solo tiene sentido con el catálogo encendido.
    pedidos_web_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // La vitrina aparece en Google: entra al sitemap y su cabecera no lleva noindex. Encendido
    // por defecto (el catálogo ya es público); lo apaga el superusuario a quien no lo quiera.
    seo_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'companies',
    modelName: 'Company',
    timestamps: false
  });
  return Company;
};
