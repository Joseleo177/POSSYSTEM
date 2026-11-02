'use strict';

// Varias fotos por producto (02-11-2026). Lo pidió una tienda de anillos, pulseras y relojes
// que no trabaja con variantes: los modelos comparten precio y existencias, así que cargan un
// solo producto y quieren mostrar en la vitrina todas las piezas que entran en él.
//
// La foto principal sigue en products.image_filename: la usan la caja, los tickets, la mesa,
// la herencia por código de barras y la grilla del catálogo, y nada de eso cambia. Aquí van
// solo las fotos ADICIONALES, que se muestran en la ficha del producto de la vitrina.
// `label` es un nombre opcional para la pieza de la foto ("Modelo 3", "Dorado").
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_filename VARCHAR(255) NOT NULL,
        label          VARCHAR(60),
        position       INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS product_images_producto ON product_images (product_id, position);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS product_images;`);
  },
};
