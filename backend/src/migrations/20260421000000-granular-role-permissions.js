'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles SET permissions = '{"all": true}'::jsonb
        WHERE name = 'admin';

      UPDATE roles SET permissions = '{
        "sales": true,
        "products": true,
        "customers": true,
        "inventory": true,
        "purchases": true,
        "accounting": true,
        "reports": true,
        "config": false
      }'::jsonb
        WHERE name = 'manager';

      UPDATE roles SET permissions = '{
        "sales": true,
        "customers": true
      }'::jsonb
        WHERE name = 'cashier';

      UPDATE roles SET permissions = '{
        "products": true,
        "inventory": true,
        "purchases": true
      }'::jsonb
        WHERE name = 'warehouse';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles SET permissions = '{"sales":true,"reports":true,"config":true,"customers":true,"products":true}'::jsonb
        WHERE name = 'manager';
      UPDATE roles SET permissions = '{"sales":true,"customers":true,"inventory_view":true}'::jsonb
        WHERE name = 'cashier';
      UPDATE roles SET permissions = '{"products":true,"inventory":true,"categories":true}'::jsonb
        WHERE name = 'warehouse';
    `);
  },
};
