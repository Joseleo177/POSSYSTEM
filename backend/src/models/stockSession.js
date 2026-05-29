module.exports = (sequelize, DataTypes) => {
  const StockSession = sequelize.define('StockSession', {
    warehouse_id: DataTypes.INTEGER,
    employee_id:  DataTypes.INTEGER,
    company_id:   DataTypes.INTEGER,
    status:       { type: DataTypes.STRING, defaultValue: 'open' },
    opened_at:    DataTypes.DATE,
    closed_at:    DataTypes.DATE,
    notes:        DataTypes.TEXT,
  }, { tableName: 'stock_sessions', underscored: true });

  StockSession.associate = (models) => {
    StockSession.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
    StockSession.belongsTo(models.Employee,  { foreignKey: 'employee_id' });
    StockSession.hasMany(models.StockSessionLine, { foreignKey: 'session_id', as: 'lines' });
  };

  return StockSession;
};
