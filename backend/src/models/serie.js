module.exports = (sequelize, DataTypes) => {
  const Serie = sequelize.define('Serie', {
    name:    { type: DataTypes.STRING(100), allowNull: false },
    prefix:  { type: DataTypes.STRING(10),  allowNull: false },
    padding: { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 4 },
    active:  { type: DataTypes.BOOLEAN,     defaultValue: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'series', timestamps: true, createdAt: 'created_at', updatedAt: false });
  return Serie;
};
