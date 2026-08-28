'use strict';

/**
 * Las empresas creadas desde la pantalla de Empresas nacían sin categorías de egreso ni de
 * ingreso.
 *
 * El alta solo sembraba monedas y el administrador; las categorías venían del seed de las
 * migraciones que crearon las tablas (20260414000000 y 20260525000001), y ese seed corrió una
 * sola vez, para la primera empresa. Como `expenses.category_id` e `incomes.category_id` son
 * NOT NULL, la empresa nueva no podía registrar ni un gasto: el desplegable salía vacío.
 *
 * A partir de ahora las siembra el propio alta (controllers/companies.js). Esta migración
 * repara las que ya estaban creadas.
 *
 * Las listas van copiadas a propósito, no importadas de config/defaultCategories.js: una
 * migración aplicada no debe cambiar de comportamiento porque mañana se edite aquella lista.
 */
const DEFAULT_EXPENSE_CATEGORIES = [
  'Servicios Básicos',
  'Alquiler',
  'Nómina / Personal',
  'Impuestos',
  'Mantenimiento',
  'Transporte',
  'Suministros',
  'Otros',
];

const DEFAULT_INCOME_CATEGORIES = [
  'Ventas Externas',
  'Transferencia de Cuentas',
  'Préstamo / Capital',
  'Devolución de Proveedor',
  'Comisiones',
  'Otros',
];

const values = (names) =>
  names.map((name) => `('${name.replace(/'/g, "''")}')`).join(', ');

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      for (const table of ['expense_categories', 'income_categories']) {
        // Los seeds originales pusieron ids explícitos (1..8 y 1..6) sin avanzar la secuencia,
        // que sigue apuntando a 1: sin esto el INSERT de abajo choca contra la fila id=1 y,
        // al estar todo en una transacción, tumba la migración y con ella el arranque.
        await q(`
          SELECT setval(
                   pg_get_serial_sequence('${table}', 'id'),
                   GREATEST(COALESCE((SELECT MAX("id") FROM "${table}"), 1), 1)
                 )
        `);
      }

      // Toda empresa sin categorías propias recibe el juego por defecto. Idempotente: a quien
      // ya tiene aunque sea una no se le toca, para no reponer las que borró a mano.
      await q(`
        INSERT INTO "expense_categories" ("name", "active", "company_id")
        SELECT d.name, TRUE, c."id"
          FROM "companies" c
         CROSS JOIN (VALUES ${values(DEFAULT_EXPENSE_CATEGORIES)}) AS d(name)
         WHERE NOT EXISTS (
           SELECT 1 FROM "expense_categories" ec WHERE ec."company_id" = c."id"
         )
      `);

      await q(`
        INSERT INTO "income_categories" ("name", "active", "company_id")
        SELECT d.name, TRUE, c."id"
          FROM "companies" c
         CROSS JOIN (VALUES ${values(DEFAULT_INCOME_CATEGORIES)}) AS d(name)
         WHERE NOT EXISTS (
           SELECT 1 FROM "income_categories" ic WHERE ic."company_id" = c."id"
         )
      `);

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // Sin vuelta atrás: no hay forma de distinguir las categorías que sembró esta migración
    // de las que la empresa ya tenía o creó después, y borrarlas dejaría egresos e ingresos
    // colgando de un category_id inexistente.
  },
};