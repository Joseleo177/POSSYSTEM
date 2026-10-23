'use strict';
const { Model } = require('sequelize');

// Orden de fabricación. Estándar o a medida; lo terminado entra al stock o se factura al
// cliente desde la misma orden (ver services/factory).
module.exports = (sequelize, DataTypes) => {
  class FabricationOrder extends Model {
    static associate(models) {
      FabricationOrder.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
      FabricationOrder.belongsTo(models.Product,   { foreignKey: 'product_id' });
      FabricationOrder.belongsTo(models.Customer,  { foreignKey: 'customer_id' });
      FabricationOrder.belongsTo(models.Sale,      { foreignKey: 'sale_id' });
      FabricationOrder.belongsTo(models.Employee,  { foreignKey: 'employee_id' });
      FabricationOrder.hasMany(models.FabricationOrderPiece, { as: 'pieces', foreignKey: 'order_id' });
      FabricationOrder.hasMany(models.FabricationOrderItem,  { as: 'items',  foreignKey: 'order_id' });
      FabricationOrder.hasMany(models.FabricationOrderPlan,  { as: 'plan',   foreignKey: 'order_id' });
    }
  }
  FabricationOrder.init({
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:       { type: DataTypes.INTEGER, allowNull: true },
    number:           { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id:     { type: DataTypes.INTEGER, allowNull: false },
    type:             { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medida' },
    destination:      { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'cliente' },
    product_id:       { type: DataTypes.INTEGER, allowNull: true },
    description:      { type: DataTypes.STRING(300), allowNull: false },
    quantity:         { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1 },
    customer_id:      { type: DataTypes.INTEGER, allowNull: true },
    status:           { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'abierta' },
    material_cost:    { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    accessories_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    sale_price:       { type: DataTypes.DECIMAL(14, 5), allowNull: true },
    sale_id:          { type: DataTypes.INTEGER, allowNull: true },
    notes:            { type: DataTypes.TEXT, allowNull: true },
    instructions:     { type: DataTypes.TEXT, allowNull: true },
    params:           { type: DataTypes.JSONB, allowNull: true },
    current_stage_id: { type: DataTypes.INTEGER, allowNull: true },
    labor_cost:       { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    due_date:         { type: DataTypes.DATEONLY, allowNull: true },
    assignee:         { type: DataTypes.STRING(80), allowNull: true },
    employee_id:      { type: DataTypes.INTEGER, allowNull: true },
    finished_at:      { type: DataTypes.DATE, allowNull: true },
    invoiced_at:      { type: DataTypes.DATE, allowNull: true },
    cancelled_at:     { type: DataTypes.DATE, allowNull: true },
    cancel_reason:    { type: DataTypes.STRING(300), allowNull: true },
  }, {
    sequelize,
    tableName: 'fabrication_orders',
    modelName: 'FabricationOrder',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return FabricationOrder;
};
