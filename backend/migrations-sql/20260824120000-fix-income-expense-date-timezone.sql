-- Corrección de las fechas de ingresos y egresos guardadas con el desfase de zona horaria.
--
-- QUÉ PASÓ: la fecha elegida en el calendario ('YYYY-MM-DD') se anclaba a la medianoche de
-- la zona DEL PROCESO. En Docker el proceso corre en America/Caracas y quedaba bien; en
-- Vercel corre en UTC, así que el 22 se guardaba como 2026-08-22T00:00:00Z — que en Caracas
-- (UTC-4) son las 8 de la noche del 21. Resultado: el movimiento se veía un día antes.
--
-- POR QUÉ ESTE UPDATE ES SEGURO: en los dos casos la PARTE DE FECHA LEÍDA EN UTC es el día
-- que la persona eligió.
--     guardado con el bug   → 2026-08-22T00:00:00Z → en UTC es el 22  ✓
--     guardado sin el bug   → 2026-08-22T04:00:00Z → en UTC es el 22  ✓
-- Así que normalizar todo a la medianoche de Caracas de ese día recupera el día elegido y
-- deja intacto lo que ya estaba bien. Es idempotente: correrlo dos veces no mueve nada.
--
-- OJO: aplasta la hora a medianoche. Para incomes/expenses `date` es una fecha de calendario
-- (el día al que se imputa el movimiento), no un instante, así que no se pierde información.
-- `created_at`, que sí es el instante en que se registró, no se toca.
--
-- Requiere el arreglo de backend/src/utils/localDate.js desplegado; si no, los movimientos
-- nuevos volverán a guardarse corridos.

-- ── 1. Diagnóstico: mirar ANTES de tocar nada ──────────────────────────────────
-- Muestra cómo se ve hoy cada fecha y cómo quedaría. Si la columna "quedaria" es el día que
-- la persona eligió al cargar el movimiento, el UPDATE de abajo es correcto.
--
-- SELECT id, description,
--        date AS guardado_utc,
--        (date AT TIME ZONE 'America/Caracas')::date AS se_ve_hoy,
--        (date AT TIME ZONE 'UTC')::date             AS quedaria
--   FROM incomes
--  WHERE date IS NOT NULL
--  ORDER BY id;

-- ── 2. Corrección ──────────────────────────────────────────────────────────────
BEGIN;

UPDATE incomes
   SET date = ((date AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'America/Caracas')
 WHERE date IS NOT NULL;

UPDATE expenses
   SET date = ((date AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'America/Caracas')
 WHERE date IS NOT NULL;

COMMIT;

-- ── 3. Comprobación ────────────────────────────────────────────────────────────
-- Tras el COMMIT, todas las fechas deben quedar a las 04:00Z (medianoche en Caracas):
--
-- SELECT id, date, (date AT TIME ZONE 'America/Caracas')::date AS dia_visible
--   FROM incomes WHERE date IS NOT NULL ORDER BY id;
