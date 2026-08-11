'use strict';

/**
 * Las categorías de ingreso quedaban invisibles en el selector de "Registrar Ingreso".
 *
 * La migración que creó income_categories las sembró con un bulkInsert sin company_id, y ese
 * insert corre fuera del contexto de request, así que el hook beforeCreate que asigna el
 * tenant no actuaba. IncomeCategory sí está en tenantModels, de modo que toda consulta de un
 * empleado con empresa filtra por company_id y no encontraba ninguna: el desplegable mostraba
 * "no hay resultados" y no se podía registrar un ingreso.
 *
 * expense_categories no tenía el problema porque la migración de aislamiento multi-empresa
 * (20260415185900) ya las había reasignado; incomes se creó después y quedó fuera de aquella.
 *
 * Aquí se adoptan las huérfanas y, en instalaciones con más de una empresa, se le da a cada
 * una su propio juego por defecto: las categorías son por empresa, no compartidas.
 */
const DEFAULT_INCOME_CATEGORIES = [
  'Ventas Externas',
  'Transferencia de Cuentas',
  'Préstamo / Capital',
  'Devolución de Proveedor',
  'Comisiones',
  'Otros',
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Las huérfanas van a la empresa más antigua, que es la que venía usándolas.
      await q(`
        UPDATE "income_categories"
           SET "company_id" = (SELECT MIN("id") FROM "companies")
         WHERE "company_id" IS NULL
           AND EXISTS (SELECT 1 FROM "companies")
      `);

      // Mismo criterio para ingresos sueltos, que el filtro por empresa también ocultaría.
      await q(`
        UPDATE "incomes"
           SET "company_id" = (SELECT MIN("id") FROM "companies")
         WHERE "company_id" IS NULL
           AND EXISTS (SELECT 1 FROM "companies")
      `);

      // El bulkInsert que sembró las categorías puso ids explícitos (1..6) sin avanzar la
      // secuencia, que sigue apuntando a 1: sin esto el INSERT de abajo choca contra la fila
      // id=1 y, al estar todo en una transacción, tumba la migración entera y el arranque.
      await q(`
        SELECT setval(
                 pg_get_serial_sequence('income_categories', 'id'),
                 GREATEST(COALESCE((SELECT MAX("id") FROM "income_categories"), 1), 1)
               )
      `);

      // Cada empresa sin categorías propias recibe el juego por defecto. Idempotente: no
      // duplica si ya las tiene, y no hace nada en instalaciones de una sola empresa.
      const values = DEFAULT_INCOME_CATEGORIES
        .map((name) => `('${name.replace(/'/g, "''")}')`)
        .join(', ');

      await q(`
        INSERT INTO "income_categories" ("name", "active", "company_id")
        SELECT d.name, TRUE, c."id"
          FROM "companies" c
         CROSS JOIN (VALUES ${values}) AS d(name)
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
    // Sin vuelta atrás: revertir dejaría las categorías inaccesibles otra vez, y no hay forma
    // de distinguir las que esta migración adoptó de las que ya estaban bien asignadas.
  },
};
