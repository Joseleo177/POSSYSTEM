module.exports = (sequelize, DataTypes) => {
  const UserSerie = sequelize.define('UserSerie', {
    user_id:  { type: DataTypes.INTEGER, allowNull: false },
    serie_id: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'user_series', timestamps: false });
  return UserSerie;
};
