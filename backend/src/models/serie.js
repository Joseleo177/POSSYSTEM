module.exports = (sequelize, DataTypes) => {
  const Serie = sequelize.define('Serie', {
    name:    { type: DataTypes.STRING(100), allowNull: false },
    prefix:  { type: DataTypes.STRING(10),  allowNull: false },
    padding: { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 4 },
    active:  { type: DataTypes.BOOLEAN,     defaultValue: true },
    type:    { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'factura' }, // 'factura' | 'nc'
    nc_serie_id: { type: DataTypes.INTEGER, allowNull: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    // Cada sucursal (almacén) numera sus facturas por su cuenta.
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'series', timestamps: true, createdAt: 'created_at', updatedAt: false });
  return Serie;
};
