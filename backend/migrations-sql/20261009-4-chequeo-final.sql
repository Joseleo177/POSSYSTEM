-- Chequeo final después de migrar, en UNA consulta (Supabase solo muestra el último resultado).
-- Cada fila dice cuánto tiene que dar.
SELECT 'migraciones registradas (debe ser 5)' AS chequeo,
       (SELECT COUNT(*) FROM "SequelizeMeta" WHERE name IN (
          '20260915100000-increase-discount-precision.js','20261006100000-bank-reconciliation.js',
          '20261006120000-journal-direction.js','20261006140000-journal-accounts.js',
          '20261009100000-reconciliation-grouped-charges.js')) AS valor
UNION ALL SELECT 'diarios sin métodos (debe ser 0)',
       (SELECT COUNT(*) FROM payment_journals pj WHERE pj.merged_into_id IS NULL AND COALESCE(pj.type,'') <> ''
          AND NOT EXISTS (SELECT 1 FROM payment_journal_methods m WHERE m.journal_id = pj.id))
UNION ALL SELECT 'cobros/egresos/ingresos sin método (debe ser 0)',
       (SELECT COUNT(*) FROM payments WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL)
     + (SELECT COUNT(*) FROM expenses WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL)
     + (SELECT COUNT(*) FROM incomes  WHERE payment_journal_id IS NOT NULL AND payment_method IS NULL)
UNION ALL SELECT 'movimientos en diarios fusionados (debe ser 0)',
       (SELECT COUNT(*) FROM payments p JOIN payment_journals j ON j.id = p.payment_journal_id WHERE j.merged_into_id IS NOT NULL)
     + (SELECT COUNT(*) FROM expenses e JOIN payment_journals j ON j.id = e.payment_journal_id WHERE j.merged_into_id IS NOT NULL)
     + (SELECT COUNT(*) FROM incomes  i JOIN payment_journals j ON j.id = i.payment_journal_id WHERE j.merged_into_id IS NOT NULL);
