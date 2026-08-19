-- Equivalente SQL de la migración 20260819170000-payment-idempotency-and-invoice-unique.js
--
-- El backend en Vercel no ejecuta `db:migrate`, así que en Supabase esto se aplica a mano y
-- se registra en SequelizeMeta para que la instalación local y la nube no se desincronicen.
--
-- Ejecutar los pasos EN ORDEN y leer el paso 0 antes de nada.


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 0 · Comprobación previa (no modifica nada)
--
-- El índice único de correlativos falla si ya existen números repetidos dentro de una
-- misma empresa. Si esta consulta devuelve filas, hay que corregir esas ventas ANTES de
-- seguir: son facturas con el mismo número, un problema que este índice solo destapa.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT company_id, invoice_number, count(*) AS repetidas
FROM sales
WHERE invoice_number IS NOT NULL
GROUP BY company_id, invoice_number
HAVING count(*) > 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 · Idempotencia de cobros
--
-- Evita que un abono parcial reenviado (corte de red, doble toque en la tablet) se
-- registre dos veces. Los pagos ya existentes quedan con NULL, y el índice único ignora
-- los NULL, así que conviven sin estorbar.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_key
  ON payments (idempotency_key);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 · Correlativo único por empresa
--
-- Red de seguridad bajo el bloqueo del rango de serie: la base rechaza un número de
-- factura repetido venga de donde venga. Va por empresa porque cada una lleva sus propias
-- series y el A-0001 de una no tiene relación con el de otra.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS sales_company_invoice_number_key
  ON sales (company_id, invoice_number);


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 · Registrar la migración
--
-- Sin esto, la próxima vez que alguien corra `db:migrate` contra esta base, Sequelize
-- intentará aplicarla de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "SequelizeMeta" (name)
VALUES ('20260819170000-payment-idempotency-and-invoice-unique.js')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN · debe devolver las dos filas de índice y la migración registrada
-- ─────────────────────────────────────────────────────────────────────────────
SELECT indexname FROM pg_indexes
WHERE indexname IN ('payments_idempotency_key_key', 'sales_company_invoice_number_key');

SELECT name FROM "SequelizeMeta"
WHERE name = '20260819170000-payment-idempotency-and-invoice-unique.js';


-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSIÓN (solo si hiciera falta deshacer)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS sales_company_invoice_number_key;
-- DROP INDEX IF EXISTS payments_idempotency_key_key;
-- ALTER TABLE payments DROP COLUMN IF EXISTS idempotency_key;
-- DELETE FROM "SequelizeMeta" WHERE name = '20260819170000-payment-idempotency-and-invoice-unique.js';
