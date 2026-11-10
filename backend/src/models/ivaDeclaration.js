'use strict';
const { Model } = require('sequelize');

// Declaración de IVA del período (forma 30). Montos en bolívares. Las casillas de los libros se guardan
// al calcular; los totales (cuota, excedente siguiente, total a pagar…) se calculan al leer en
// services/fiscal/declaracionIva.js. Ver la migración 20261117100000-declaracion-iva.
module.exports = (sequelize, DataTypes) => {
  class IvaDeclaration extends Model {
    static associate(models) {}
  }
  // Una definición nueva por campo: Sequelize escribe en ella el nombre de la columna, y un objeto
  // compartido dejaba todos los montos apuntando a la misma.
  const monto = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
  IvaDeclaration.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    periodo: { type: DataTypes.STRING(6), allowNull: false },
    quincena: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'mes' },
    fecha_desde: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_hasta: { type: DataTypes.DATEONLY, allowNull: false },
    // borrador · declarada · pagada
    state: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'borrador' },
    documentos_ventas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    documentos_compras: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sin_iva_ventas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ventas_exentas: monto(),
    ventas_base_general: monto(),
    debito_general: monto(),
    ventas_base_adicional: monto(),
    debito_adicional: monto(),
    ventas_base_reducida: monto(),
    debito_reducida: monto(),
    compras_exentas: monto(),
    compras_base_general: monto(),
    credito_general: monto(),
    compras_base_adicional: monto(),
    credito_adicional: monto(),
    compras_base_reducida: monto(),
    credito_reducida: monto(),
    creditos_prorrata: monto(),
    prorrata_manual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    excedente_anterior: monto(),
    retenciones_anteriores: monto(),
    retenciones_periodo: monto(),
    anticipo_porcentaje: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    planilla: { type: DataTypes.STRING(40), allowNull: true },
    fecha_pago: { type: DataTypes.DATEONLY, allowNull: true },
    referencia_pago: { type: DataTypes.STRING(80), allowNull: true },
    calculated_at: { type: DataTypes.DATE, allowNull: true },
    declared_at: { type: DataTypes.DATE, allowNull: true },
    declared_by: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'iva_declarations',
    modelName: 'IvaDeclaration',
    timestamps: false,
  });
  return IvaDeclaration;
};
