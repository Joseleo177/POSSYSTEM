-- RESPALDO de lo que toca la migración de octubre. Correr en el editor SQL de Supabase JUSTO
-- ANTES de migrar (después de la última venta del día).
--
-- Copia, en el esquema aparte `respaldo_20261009`, las tablas y columnas que cambian
-- journal-direction y journal-accounts (la fusión de diarios) y bank-reconciliation (roles).
-- Con esto se puede devolver cada cobro, egreso, ingreso, pago a proveedor, venta y arqueo a
-- su diario original sin restaurar la base entera ni perder las ventas del día.
--
-- No es accesible por la API pública: PostgREST solo expone `public`. Se borra cuando todo
-- esté verificado (al final de este archivo está el DROP, comentado).

BEGIN;

CREATE SCHEMA respaldo_20261009;

CREATE TABLE respaldo_20261009.payment_journals           AS TABLE public.payment_journals;
CREATE TABLE respaldo_20261009.payment_journal_warehouses AS TABLE public.payment_journal_warehouses;
CREATE TABLE respaldo_20261009.payment_methods            AS TABLE public.payment_methods;
CREATE TABLE respaldo_20261009.cash_session_journals      AS TABLE public.cash_session_journals;
CREATE TABLE respaldo_20261009.roles                      AS SELECT id, company_id, name, permissions FROM public.roles;
CREATE TABLE respaldo_20261009.sequelize_meta             AS TABLE public."SequelizeMeta";

-- De los movimientos solo hace falta a qué diario apuntaban.
CREATE TABLE respaldo_20261009.payments          AS SELECT id, payment_journal_id, change_journal_id FROM public.payments;
CREATE TABLE respaldo_20261009.expenses          AS SELECT id, payment_journal_id FROM public.expenses;
CREATE TABLE respaldo_20261009.incomes           AS SELECT id, payment_journal_id FROM public.incomes;
CREATE TABLE respaldo_20261009.purchase_payments AS SELECT id, payment_journal_id FROM public.purchase_payments;
CREATE TABLE respaldo_20261009.sales             AS SELECT id, payment_journal_id FROM public.sales WHERE payment_journal_id IS NOT NULL;

COMMIT;

-- Comprobación: las filas de cada copia tienen que coincidir con las de su tabla (diferencia 0).
SELECT 'payment_journals' t, (SELECT COUNT(*) FROM respaldo_20261009.payment_journals) - (SELECT COUNT(*) FROM public.payment_journals) diferencia
UNION ALL SELECT 'cash_session_journals', (SELECT COUNT(*) FROM respaldo_20261009.cash_session_journals) - (SELECT COUNT(*) FROM public.cash_session_journals)
UNION ALL SELECT 'payments',          (SELECT COUNT(*) FROM respaldo_20261009.payments)          - (SELECT COUNT(*) FROM public.payments)
UNION ALL SELECT 'expenses',          (SELECT COUNT(*) FROM respaldo_20261009.expenses)          - (SELECT COUNT(*) FROM public.expenses)
UNION ALL SELECT 'incomes',           (SELECT COUNT(*) FROM respaldo_20261009.incomes)           - (SELECT COUNT(*) FROM public.incomes)
UNION ALL SELECT 'purchase_payments', (SELECT COUNT(*) FROM respaldo_20261009.purchase_payments) - (SELECT COUNT(*) FROM public.purchase_payments);

-- Cuando todo esté verificado y desplegado (unos días después):
-- DROP SCHEMA respaldo_20261009 CASCADE;
