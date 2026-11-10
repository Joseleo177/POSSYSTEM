'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Purchase extends Model {
    static associate(models) {}
  }
  Purchase.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    supplier_id: { type: DataTypes.INTEGER },
    supplier_name: { type: DataTypes.STRING(200) },
    notes: { type: DataTypes.TEXT },
    total: { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    // Moneda y tasa con que se cargó la factura del proveedor. El total y los costos siguen
    // guardándose en moneda base: esto es el registro de a qué tasa se compró ese día.
    currency_id:   { type: DataTypes.INTEGER },
    exchange_rate: { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    employee_id:     { type: DataTypes.INTEGER },
    warehouse_id:    { type: DataTypes.INTEGER },
    // borrador · pendiente · parcial · recibido. 'parcial' es una orden abierta que ya metió
    // mercancía al inventario: se llega ahí con el modo recepción, cargando la factura
    // mientras el camión se descarga.
    status:          { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'borrador' },
    // Con el interruptor prendido, cada línea que se guarda entra al stock en el acto.
    receiving_mode:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    payment_status:  { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pendiente' },
    // Vencimiento pactado para esta compra. Nulo = fecha de la compra + días de crédito del
    // proveedor, calculado al leer (ver services/purchases/payablesService.js).
    due_date:        { type: DataTypes.DATEONLY, allowNull: true },
    // 'mercancia' (productos que entran al inventario) o 'servicios' (factura sin mercancía, solo
    // líneas de gasto en purchase_charges: no se recibe, queda registrada y por pagar).
    kind:            { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'mercancia' },
    // Factura del proveedor (IVA, ver services/purchases/fiscalCompra.js). `fiscal` = trae factura
    // fiscal: lleva IVA por línea y entra al Libro de compras. Sin ella (nota de entrega) nada cambia.
    fiscal:                  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    supplier_rif:            { type: DataTypes.STRING(20), allowNull: true },
    supplier_invoice_number: { type: DataTypes.STRING(40), allowNull: true },
    supplier_control_number: { type: DataTypes.STRING(40), allowNull: true },
    supplier_invoice_date:   { type: DataTypes.DATEONLY, allowNull: true },
    // IVA de la factura en moneda base: forma parte de `total` (lo que se le debe al proveedor).
    iva_amount:              { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    // Corrección a mano del IVA, en la moneda de la factura, cuando el proveedor redondeó distinto.
    iva_adjust:              { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    created_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'purchases',
    modelName: 'Purchase',
    timestamps: false
  });
  return Purchase;
};
