-- SOLO LECTURA. Correr en el editor SQL de Supabase ANTES de migrar.
--
-- Muestra qué diarios va a fusionar la migración 20261006140000-journal-accounts: los de la
-- misma empresa, banco, moneda y juego de sucursales (el efectivo no se fusiona). El primero
-- de cada lista es el que queda (el activo de id menor); los demás pasan sus cobros, egresos,
-- ingresos, pagos a proveedor y arqueos al que queda y quedan inactivos como "(fusionado)".
--
-- Revisar con el dueño de cada empresa que esas cuentas sean de verdad la MISMA cuenta
-- bancaria. Si dos diarios son cuentas distintas del mismo banco (Venezuela 1 y 2), hay que
-- separarlos ANTES de migrar asignándoles sucursales distintas, o ponerles bancos distintos.

WITH wh AS (
  SELECT journal_id, string_agg(warehouse_id::text, ',' ORDER BY warehouse_id) AS w
    FROM payment_journal_warehouses GROUP BY journal_id
)
SELECT c.name                                   AS empresa,
       b.name                                   AS banco,
       cur.code                                 AS moneda,
       COALESCE(NULLIF(COALESCE(wh.w, ''), ''), 'todas') AS sucursales,
       array_agg(pj.id   ORDER BY pj.active DESC, pj.id) AS ids,
       array_agg(pj.name ORDER BY pj.active DESC, pj.id) AS diarios
  FROM payment_journals pj
  JOIN companies c   ON c.id = pj.company_id
  JOIN banks b       ON b.id = pj.bank_id
  LEFT JOIN currencies cur ON cur.id = pj.currency_id
  LEFT JOIN wh       ON wh.journal_id = pj.id
 WHERE COALESCE(pj.type, '') <> 'efectivo'
   AND pj.bank_id IS NOT NULL
 GROUP BY c.name, b.name, cur.code, pj.company_id, pj.bank_id, pj.currency_id, COALESCE(wh.w, '')
HAVING COUNT(*) > 1
 ORDER BY c.name, b.name;
