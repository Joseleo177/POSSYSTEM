'use strict';

// Beneficios de la ficha pública ("Repara y fortalece", "Reduce el frizz", "+Crecimiento
// -Caída"): los sellos redondos que las tiendas de referencia repiten en decenas de
// productos con la misma redacción.
//
// Por eso son una lista reusable y NO texto libre por producto: si cada ficha lo escribiera
// a mano, "Reduce el frizz" y "Anti-frizz" terminarían conviviendo en la misma vitrina, y
// cambiar la redacción de un beneficio significaría editar cada producto que lo usa uno por
// uno. Con la etiqueta compartida se edita una vez y cambia en todos.
//
// Mismo patrón que promotions/promotion_products: una tabla de etiquetas por empresa y una
// tabla puente sin más columnas que las dos llaves.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('catalog_benefit_tags', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name:       { type: Sequelize.STRING(60), allowNull: false },
      company_id: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // Una empresa no puede tener dos etiquetas con el mismo nombre: si el problema es que
    // ya conviven "Reduce el frizz" y "Anti-frizz" por escribirlo a mano, permitir el
    // duplicado en la lista reusable reproduciría el mismo problema un nivel más arriba.
    await queryInterface.addIndex('catalog_benefit_tags', ['company_id', 'name'], {
      unique: true,
      name: 'catalog_benefit_tags_company_name',
    });

    await queryInterface.createTable('product_benefit_tags', {
      product_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'products', key: 'id' }, onDelete: 'CASCADE',
      },
      benefit_tag_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'catalog_benefit_tags', key: 'id' }, onDelete: 'CASCADE',
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_benefit_tags');
    await queryInterface.dropTable('catalog_benefit_tags');
  },
};
