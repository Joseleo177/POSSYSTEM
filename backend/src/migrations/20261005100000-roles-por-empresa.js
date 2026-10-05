'use strict';

/**
 * Los roles pasan a ser de cada empresa.
 *
 * La tabla `roles` quedó fuera del paso a multiempresa: había un solo "Cajero" para toda la
 * instalación, así que cuando el admin de una empresa le marcaba "Editar cuenta abierta",
 * se lo estaba marcando a los cajeros de todas las demás.
 *
 * Cada empresa recibe una copia de los roles tal como están hoy —nadie gana ni pierde un
 * permiso con esto— y sus empleados se pasan a la copia de su empresa. Los roles sin
 * empresa se conservan como plantilla: de ahí salen los de cada empresa nueva.
 *
 * El nombre deja de ser único en toda la tabla: lo es dentro de cada empresa, y entre las
 * plantillas.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`
        ALTER TABLE roles
          ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
      `);
      await q(`ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS roles_company_name_key ON roles (company_id, name) WHERE company_id IS NOT NULL`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS roles_template_name_key ON roles (name) WHERE company_id IS NULL`);
      await q(`CREATE INDEX IF NOT EXISTS roles_company_id_idx ON roles (company_id)`);

      // Una copia de cada plantilla por empresa, con los permisos que tiene hoy.
      await q(`
        INSERT INTO roles (name, label, permissions, company_id)
        SELECT t.name, t.label, t.permissions, c.id
          FROM roles t
         CROSS JOIN companies c
         WHERE t.company_id IS NULL
         ORDER BY c.id, t.id   -- la pantalla los lista por id: que sigan en el orden de siempre
        ON CONFLICT DO NOTHING
      `);

      // Cada empleado pasa a la copia de su empresa del rol que ya tenía.
      await q(`
        UPDATE employees e
           SET role_id = nuevo.id
          FROM roles viejo
          JOIN roles nuevo ON nuevo.name = viejo.name
         WHERE e.role_id = viejo.id
           AND viejo.company_id IS NULL
           AND nuevo.company_id = e.company_id
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // Vuelven a la plantilla del mismo nombre. Lo que cada empresa haya recortado en su
      // copia se pierde: con un rol global no hay dónde guardarlo.
      await q(`
        UPDATE employees e
           SET role_id = t.id
          FROM roles r
          JOIN roles t ON t.name = r.name AND t.company_id IS NULL
         WHERE e.role_id = r.id
           AND r.company_id IS NOT NULL
      `);
      await q(`DELETE FROM roles WHERE company_id IS NOT NULL`);
      await q(`DROP INDEX IF EXISTS roles_company_id_idx`);
      await q(`DROP INDEX IF EXISTS roles_template_name_key`);
      await q(`DROP INDEX IF EXISTS roles_company_name_key`);
      await q(`ALTER TABLE roles DROP COLUMN IF EXISTS company_id`);
      await q(`ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name)`);
    });
  },
};
