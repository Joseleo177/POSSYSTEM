'use strict';

// Variantes de producto (talla, color) para tiendas de ropa y calzado.
//
// Cada variante es un producto más —una fila en `products` con `parent_id` apuntando a su
// modelo— y no una tabla aparte. Ventas, compras, transferencias, ajustes, kardex, combos y
// etiquetas apuntan todos a `product_id`: con la variante como producto siguen funcionando
// sin enterarse, y el escáner del POS la encuentra por su propio código de barras.
//
// El modelo ("Franela Básica") es la plantilla: no se vende, no lleva existencias y nunca
// tiene ficha en product_stock. Sus variantes ("Franela Básica Negro / L") sí.
//
// Los atributos y sus valores son listas por empresa, no texto libre: si cada variante
// escribiera su talla a mano, "M" y "m" terminarían siendo tallas distintas en los reportes.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'parent_id', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'products', key: 'id' }, onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn('products', 'is_variant_parent', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
    // Los ids de sus valores, ordenados y unidos con guiones ("7-12"). Con el índice único de
    // abajo la base rechaza una segunda "Negro / L" del mismo modelo.
    await queryInterface.addColumn('products', 'variant_key', {
      type: Sequelize.STRING(100), allowNull: true,
    });
    // La variante sigue el precio del modelo salvo que tenga uno propio (la talla grande
    // que cuesta más): esas no se tocan cuando cambia el del modelo.
    await queryInterface.addColumn('products', 'own_price', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    });
    await queryInterface.addIndex('products', ['parent_id'], { name: 'products_parent_id' });
    await queryInterface.addIndex('products', ['parent_id', 'variant_key'], {
      unique: true,
      name: 'products_parent_variant_key_unique',
      where: { parent_id: { [Sequelize.Op.ne]: null } },
    });

    await queryInterface.createTable('product_attributes', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      company_id: { type: Sequelize.INTEGER, allowNull: true },
      name:       { type: Sequelize.STRING(40), allowNull: false },
      position:   { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('product_attributes', ['company_id', 'name'], {
      unique: true, name: 'product_attributes_company_name',
    });

    // `position` ordena S, M, L, XL y 38, 39, 40 en su orden real: alfabético saldría L, M, S.
    await queryInterface.createTable('product_attribute_values', {
      id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      company_id:   { type: Sequelize.INTEGER, allowNull: true },
      attribute_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'product_attributes', key: 'id' }, onDelete: 'CASCADE',
      },
      value:        { type: Sequelize.STRING(40), allowNull: false },
      position:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at:   { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:   { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('product_attribute_values', ['attribute_id', 'value'], {
      unique: true, name: 'product_attribute_values_attr_value',
    });

    // Un valor por atributo y variante: no hay franela que sea M y L a la vez. El valor no se
    // puede borrar mientras alguna variante lo use (RESTRICT).
    await queryInterface.createTable('product_variant_values', {
      product_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'products', key: 'id' }, onDelete: 'CASCADE',
      },
      attribute_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'product_attributes', key: 'id' }, onDelete: 'RESTRICT',
      },
      attribute_value_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'product_attribute_values', key: 'id' }, onDelete: 'RESTRICT',
      },
    });
    await queryInterface.addIndex('product_variant_values', ['attribute_value_id'], {
      name: 'product_variant_values_value',
    });

    // Mismo estado que el resto de public en Supabase: RLS activo sin políticas. El backend
    // entra como dueño de las tablas y no le afecta.
    for (const t of ['product_attributes', 'product_attribute_values', 'product_variant_values']) {
      await queryInterface.sequelize.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_variant_values');
    await queryInterface.dropTable('product_attribute_values');
    await queryInterface.dropTable('product_attributes');
    await queryInterface.removeIndex('products', 'products_parent_variant_key_unique');
    await queryInterface.removeIndex('products', 'products_parent_id');
    await queryInterface.removeColumn('products', 'own_price');
    await queryInterface.removeColumn('products', 'variant_key');
    await queryInterface.removeColumn('products', 'is_variant_parent');
    await queryInterface.removeColumn('products', 'parent_id');
  },
};
