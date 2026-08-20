-- Equivalente SQL de la migración 20260820120000-add-warehouse-to-payment-journals.js
--
-- El backend en Vercel no ejecuta `db:migrate`, así que en Supabase esto se aplica a mano y
-- se registra en SequelizeMeta para que la instalación local y la nube no se desincronicen.
--
-- Aplicar DESPUÉS de las dos migraciones del 19/08 (series e ingresos/egresos).


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 0 · Qué vas a estar cambiando (no modifica nada)
--
-- Lista tus diarios y a qué sucursal quedarán asignados. Miralo antes de seguir: los que
-- pertenezcan de verdad a otra sucursal habrá que reasignarlos después desde la pantalla,
-- y mientras tanto dejarán de aparecer en la caja de esa otra sucursal.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT j.id, j.name AS diario, j.company_id,
       (SELECT w.name FROM warehouses w
         WHERE w.company_id IS NOT DISTINCT FROM j.company_id
         ORDER BY w.active DESC, w.sort_order ASC, w.id ASC LIMIT 1) AS quedara_en
FROM payment_journals j
ORDER BY j.company_id, j.sort_order, j.id;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 · Agregar la columna
--
-- Opcional a propósito: NULL = diario compartido, disponible en todas las sucursales.
-- Es el caso de una cuenta bancaria de la empresa.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payment_journals
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses (id) ON DELETE RESTRICT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 · Asignar los diarios existentes al almacén principal de su empresa
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE payment_journals j
   SET warehouse_id = (
     SELECT w.id FROM warehouses w
      WHERE w.company_id IS NOT DISTINCT FROM j.company_id
      ORDER BY w.active DESC, w.sort_order ASC, w.id ASC
      LIMIT 1
   )
 WHERE j.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS payment_journals_warehouse_id_idx ON payment_journals (warehouse_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 · Registrar la migración
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "SequelizeMeta" (name)
VALUES ('20260820120000-add-warehouse-to-payment-journals.js')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN · cada diario con su sucursal
-- ─────────────────────────────────────────────────────────────────────────────
SELECT j.id, j.name AS diario, COALESCE(w.name, '(compartido)') AS sucursal
FROM payment_journals j
LEFT JOIN warehouses w ON w.id = j.warehouse_id
ORDER BY j.sort_order, j.id;

SELECT name FROM "SequelizeMeta"
WHERE name = '20260820120000-add-warehouse-to-payment-journals.js';


-- ─────────────────────────────────────────────────────────────────────────────
-- SI ALGO SALE MAL · volver todos los diarios a compartidos
--
-- Con esto vuelven a verse en todas las sucursales, sin perder ningún movimiento.
-- Es la salida rápida si una caja desaparece de donde tenía que estar.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE payment_journals SET warehouse_id = NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSIÓN COMPLETA (solo si hiciera falta deshacer la migración entera)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS payment_journals_warehouse_id_idx;
-- ALTER TABLE payment_journals DROP COLUMN IF EXISTS warehouse_id;
-- DELETE FROM "SequelizeMeta" WHERE name = '20260820120000-add-warehouse-to-payment-journals.js';