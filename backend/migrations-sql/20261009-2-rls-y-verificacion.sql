-- Correr en el editor SQL de Supabase DESPUÉS de `db:migrate` (ver README.md, despliegue de
-- octubre 2026). Las migraciones crean tablas nuevas y en Supabase todo `public` lleva RLS
-- activo sin políticas: el backend entra como dueño y no le afecta; la API pública queda
-- cerrada. No crear políticas para callar el aviso "RLS Enabled No Policy": es lo buscado.

ALTER TABLE bank_statements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_journal_methods     ENABLE ROW LEVEL SECURITY;

-- ── Verificación: cada consulta tiene que dar lo que dice el comentario ─────────────────

-- 1. Las cuatro migraciones registradas (4 filas).
SELECT name FROM "SequelizeMeta"
 WHERE name IN ('20261006100000-bank-reconciliation.js',
                '20261006120000-journal-direction.js',
                '20261006140000-journal-accounts.js',
                '20261009100000-reconciliation-grouped-charges.js');

-- 2. Las columnas existen de verdad (6 filas). SequelizeMeta no prueba que el DDL corrió.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND (
       (table_name IN ('payments','expenses','incomes','purchase_payments') AND column_name = 'payment_method')
    OR (table_name = 'bank_statements' AND column_name = 'journal_id')
    OR (table_name = 'payment_journals' AND column_name = 'account_number'));

-- 3. Ningún diario quedó sin métodos (0 filas).
SELECT pj.id, pj.company_id, pj.name FROM payment_journals pj
 WHERE pj.merged_into_id IS NULL AND COALESCE(pj.type, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM payment_journal_methods m WHERE m.journal_id = pj.id);

-- 4. Ningún movimiento con diario quedó sin método (todo en 0).
SELECT 'payments' t, COUNT(*) FROM payments WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL
UNION ALL SELECT 'incomes',  COUNT(*) FROM incomes  WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL
UNION ALL SELECT 'purchase_payments', COUNT(*) FROM purchase_payments WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL;

-- 5. Nada apunta a un diario fusionado (todo en 0).
SELECT 'payments' t, COUNT(*) FROM payments p JOIN payment_journals j ON j.id = p.payment_journal_id WHERE j.merged_into_id IS NOT NULL
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses e JOIN payment_journals j ON j.id = e.payment_journal_id WHERE j.merged_into_id IS NOT NULL
UNION ALL SELECT 'incomes',  COUNT(*) FROM incomes  i JOIN payment_journals j ON j.id = i.payment_journal_id WHERE j.merged_into_id IS NOT NULL;

-- 6. Las tablas nuevas tienen RLS (4 filas con relrowsecurity = true).
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('bank_statements','bank_statement_lines','bank_reconciliation_matches','payment_journal_methods');
