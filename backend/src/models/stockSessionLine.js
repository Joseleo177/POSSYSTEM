module.exports = (sequelize, DataTypes) => {
  const StockSessionLine = sequelize.define('StockSessionLine', {
    session_id:   DataTypes.INTEGER,
    warehouse_id: DataTypes.INTEGER,
    product_id:   DataTypes.INTEGER,
    product_name: DataTypes.STRING,
    qty_before:   DataTypes.DECIMAL(14, 4),
    qty_adjusted: DataTypes.DECIMAL(14, 4),
    qty_after:    DataTypes.DECIMAL(14, 4),
    type:         DataTypes.STRING,
    reason:       DataTypes.STRING,
    notes:        DataTypes.TEXT,
  }, { tableName: 'stock_session_lines', underscored: true });

  StockSessionLine.associate = (models) => {
    StockSessionLine.belongsTo(models.StockSession, { foreignKey: 'session_id' });
  };

  return StockSessionLine;
};
