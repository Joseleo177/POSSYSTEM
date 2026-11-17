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
    // Costo unitario del producto en esa sucursal cuando se hizo el ajuste (migración
    // 20261121110000). Con él, el reporte de mermas dice lo que se perdió a lo que costaba ese día
    // y no al costo de hoy. Null en las líneas de antes.
    unit_cost:    DataTypes.DECIMAL(14, 5),
  }, {
    tableName: 'stock_session_lines',
    underscored: true,
    hooks: {
      // Lo pone el hook y no cada camino que crea líneas (ajuste manual, Stock, compras, Fábrica,
      // importación, cocina…): así ninguno se olvida. Quien ya lo trae lo conserva.
      beforeCreate: async (line, options) => {
        if (line.get('unit_cost') != null || !line.get('product_id')) return;
        const transaction = options?.transaction;
        const { ProductStock, Product } = sequelize.models;
        const ficha = line.get('warehouse_id')
          ? await ProductStock.findOne({
              where: { warehouse_id: line.get('warehouse_id'), product_id: line.get('product_id') },
              attributes: ['cost_price'],
              transaction,
            })
          : null;
        let costo = ficha?.cost_price;
        if (costo == null) {
          const p = await Product.findByPk(line.get('product_id'), { attributes: ['cost_price'], transaction });
          costo = p?.cost_price;
        }
        if (costo == null) return;
        line.set('unit_cost', costo);
        if (options?.fields && !options.fields.includes('unit_cost')) options.fields.push('unit_cost');
      },
    },
  });

  StockSessionLine.associate = (models) => {
    StockSessionLine.belongsTo(models.StockSession, { foreignKey: 'session_id' });
  };

  return StockSessionLine;
};
