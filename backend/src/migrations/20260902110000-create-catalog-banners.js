'use strict';

// Carrusel de la vitrina pública: las imágenes grandes que la tienda cambia por campaña
// ("regreso a clases", "del 1 al 4 de septiembre").
//
// Va como tabla y no como una clave más de `settings` porque cada banner tiene archivos
// asociados que hay que subir, reemplazar y borrar uno por uno. Metido como JSON en un campo
// de texto, cada reordenamiento obligaría a reescribir la lista entera y no habría dónde
// colgar el borrado del archivo que sale.
//
// Dos imágenes por banner: la de escritorio es apaisada y la del teléfono es casi cuadrada.
// Recortar la primera por CSS deja los textos del arte fuera de cuadro — y el texto va dentro
// de la imagen, porque lo diseña quien hace la campaña, no el sistema. La de móvil es
// opcional: sin ella se usa la de escritorio.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('catalog_banners', {
      id:              { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // Nombre interno, para que el comercio sepa cuál es cuál en la lista de ajustes. No se
      // publica: en la vitrina el banner es solo la imagen.
      title:           { type: Sequelize.STRING(120), allowNull: true },
      image_filename:  { type: Sequelize.STRING(500), allowNull: false },
      image_mobile_filename: { type: Sequelize.STRING(500), allowNull: true },
      // A dónde lleva el banner al tocarlo. Vacío = no es un enlace, solo un anuncio.
      link_url:        { type: Sequelize.STRING(500), allowNull: true },
      // Texto alternativo para lectores de pantalla y para cuando la imagen no carga: el
      // arte lleva el mensaje dentro, así que sin esto la promoción no existe para quien no
      // puede verla.
      alt_text:        { type: Sequelize.STRING(200), allowNull: true },
      sort_order:      { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Apagar un banner sin borrarlo: las campañas vuelven cada año y volver a subir el
      // arte es trabajo que ya se hizo.
      active:          { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      company_id:      { type: Sequelize.INTEGER, allowNull: true },
      created_at:      { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:      { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // La vitrina siempre pide lo mismo: los banners activos de una empresa, en orden.
    await queryInterface.addIndex('catalog_banners', ['company_id', 'active', 'sort_order'], {
      name: 'catalog_banners_company_active_order',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('catalog_banners');
  },
};
