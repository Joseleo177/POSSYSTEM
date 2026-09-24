'use strict';

// Segundo carrusel de la vitrina: el de "destacados", al final de la portada, con el texto a
// un lado y la imagen al otro ("Ideal para reconstrucción inmediata…" junto a la foto del
// producto).
//
// Va en la misma tabla que el carrusel de portada porque es lo mismo —imágenes que se suben,
// se ordenan, se apagan y se borran con su archivo— y duplicar la tabla duplicaría también
// todo ese ciclo. Lo que cambia es dónde se publica (`placement`) y que aquí el texto NO va
// dentro del arte: lo escribe el comercio y lo pinta la vitrina (`heading`, `body`).
module.exports = {
  async up(queryInterface, Sequelize) {
    // 'hero' = carrusel de portada (todo lo que existía); 'feature' = destacados.
    await queryInterface.addColumn('catalog_banners', 'placement', {
      type: Sequelize.STRING(20), allowNull: false, defaultValue: 'hero',
    });
    await queryInterface.addColumn('catalog_banners', 'heading', {
      type: Sequelize.STRING(120), allowNull: true,
    });
    await queryInterface.addColumn('catalog_banners', 'body', {
      type: Sequelize.STRING(400), allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('catalog_banners', 'body');
    await queryInterface.removeColumn('catalog_banners', 'heading');
    await queryInterface.removeColumn('catalog_banners', 'placement');
  },
};
