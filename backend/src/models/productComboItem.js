module.exports = (sequelize, DataTypes) => {
  const ProductComboItem = sequelize.define("ProductComboItem", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    combo_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.NUMERIC(10, 3),
      allowNull: false,
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: "product_combo_items",
    timestamps: false,
  });

  return ProductComboItem;
};
