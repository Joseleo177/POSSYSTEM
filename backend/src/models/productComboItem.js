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
    // Lo que se descuenta por unidad vendida (el bruto). En una receta de cocina sale del
    // neto y la merma: 250 g al plato con 20 % de merma = 0,313 KG.
    quantity: {
      type: DataTypes.NUMERIC(10, 3),
      allowNull: false,
    },
    // Lo que va al plato, sin la merma. Null en combos de antes: el neto es `quantity`.
    net_quantity: {
      type: DataTypes.NUMERIC(10, 3),
      allowNull: true,
    },
    waste_pct: {
      type: DataTypes.NUMERIC(5, 2),
      allowNull: false,
      defaultValue: 0,
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
