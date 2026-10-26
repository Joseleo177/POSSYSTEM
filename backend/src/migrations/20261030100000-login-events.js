'use strict';

// Registro de accesos. Una clienta sospechaba que una cajera entraba al sistema fuera de su
// turno; la inactivó, pero no había forma de saber cuándo fue su último acceso ni si seguía
// intentando entrar. Se anota cada login (bueno o rechazado) y cada renovación de sesión, y el
// empleado guarda su último login y su última actividad para mostrarlos en la lista sin
// recorrer la tabla.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS login_events (
        id          SERIAL       PRIMARY KEY,
        company_id  INTEGER,
        employee_id INTEGER      REFERENCES employees(id) ON DELETE SET NULL,
        username    VARCHAR(100),
        kind        VARCHAR(20)  NOT NULL,
        result      VARCHAR(20)  NOT NULL,
        ip          VARCHAR(60),
        user_agent  VARCHAR(300),
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_login_events_employee ON login_events(employee_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_login_events_company  ON login_events(company_id, created_at DESC);
    `);
    await queryInterface.addColumn('employees', 'last_login_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('employees', 'last_seen_at',  { type: Sequelize.DATE, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'last_seen_at');
    await queryInterface.removeColumn('employees', 'last_login_at');
    await queryInterface.dropTable('login_events');
  },
};
