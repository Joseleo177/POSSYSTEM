'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SalePrescription extends Model {
    static associate(models) {
      if (models.Sale) {
        SalePrescription.belongsTo(models.Sale, { foreignKey: 'sale_id', as: 'sale' });
        models.Sale.hasOne(SalePrescription, { foreignKey: 'sale_id', as: 'prescription' });
      }
      if (models.Company) {
        SalePrescription.belongsTo(models.Company, { foreignKey: 'company_id' });
      }
      if (models.Employee) {
        SalePrescription.belongsTo(models.Employee, { foreignKey: 'approved_by', as: 'approver' });
      }
    }
  }
  SalePrescription.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    sale_id: { type: DataTypes.INTEGER, allowNull: false },
    patient_name: { type: DataTypes.STRING(150), allowNull: false },
    patient_id_doc: { type: DataTypes.STRING(30), allowNull: false },
    doctor_name: { type: DataTypes.STRING(150), allowNull: false },
    doctor_license: { type: DataTypes.STRING(50), allowNull: true },
    prescription_number: { type: DataTypes.STRING(60), allowNull: true },
    photo_filename: { type: DataTypes.STRING(255), allowNull: true },
    prescription_date: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'sale_prescriptions',
    modelName: 'SalePrescription',
    timestamps: false,
  });
  return SalePrescription;
};
