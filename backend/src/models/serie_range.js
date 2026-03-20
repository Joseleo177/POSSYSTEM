module.exports = (sequelize, DataTypes) => {
  const SerieRange = sequelize.define('SerieRange', {
    serie_id:       { type: DataTypes.INTEGER, allowNull: false },
    start_number:   { type: DataTypes.INTEGER, allowNull: false },
    end_number:     { type: DataTypes.INTEGER, allowNull: false },
    current_number: { type: DataTypes.INTEGER, allowNull: false },
    active:         { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'serie_ranges', timestamps: true, createdAt: 'created_at', updatedAt: false });
  return SerieRange;
};
