-- Reparte en las últimas semanas las fechas de la demo de Fábrica (seed-fabrica-demo.js), que
-- quedan todas en el día en que se corrió. Así la historia de la lámina #51 se lee en orden:
--
--   hace 35 días  carga inicial del Excel        hace 12 días  OF-0002 repisas (#51-1)
--   hace 30 días  compra (#53 en adelante)       hace  8 días  OF-0003 gabinetes
--   hace 21 días  OF-0001 fregadero (#51)        hace  2 días  OF-0004 mesón, en Corte
--                                                hace  1 día   OF-0005 servilleteros
--
-- Cada orden se entrega el día que se crea y se devuelve, pasa por etapas y se factura al día
-- siguiente. SOLO para la empresa demo, recién cargada:
--
--   docker exec -i pos_db psql -U posuser -d posdb -v company=<id> < backend/src/scripts/seed-fabrica-demo-fechas.sql

BEGIN;

CREATE TEMP TABLE demo_wh ON COMMIT DROP AS SELECT id FROM warehouses WHERE company_id = :company;

-- Orden → días hacia atrás de su creación (back) y de su cierre (done).
CREATE TEMP TABLE demo_plan ON COMMIT DROP AS
SELECT o.id, o.number, o.sale_id, 'OF-' || lpad(o.number::text, 4, '0') || ' ·%' AS notes,
       make_interval(days => v.back) AS back, make_interval(days => v.done) AS done
  FROM fabrication_orders o
  JOIN (VALUES (1, 21, 20), (2, 12, 11), (3, 8, 7), (4, 2, 2), (5, 1, 1)) AS v(num, back, done) ON v.num = o.number
 WHERE o.company_id = :company;

-- Carga inicial y compra
UPDATE stock_sessions SET opened_at = opened_at - interval '35 days', created_at = created_at - interval '35 days'
 WHERE warehouse_id IN (SELECT id FROM demo_wh);
UPDATE material_pieces SET created_at = created_at - interval '35 days'
 WHERE company_id = :company AND origin = 'carga_inicial';
UPDATE stock_session_lines SET created_at = created_at - interval '35 days'
 WHERE warehouse_id IN (SELECT id FROM demo_wh) AND notes LIKE 'Carga inicial%';
UPDATE purchases SET created_at = created_at - interval '30 days'
 WHERE warehouse_id IN (SELECT id FROM demo_wh);
UPDATE material_pieces SET created_at = created_at - interval '30 days'
 WHERE company_id = :company AND origin = 'compra';
UPDATE stock_session_lines SET created_at = created_at - interval '30 days'
 WHERE warehouse_id IN (SELECT id FROM demo_wh) AND notes LIKE 'Compra #%';

-- Órdenes
UPDATE fabrication_orders o SET created_at = o.created_at - p.back, updated_at = o.updated_at - p.done,
       finished_at = o.finished_at - p.done
  FROM demo_plan p WHERE p.id = o.id;
UPDATE fabrication_order_pieces u SET delivered_at = u.delivered_at - p.back, returned_at = u.returned_at - p.done
  FROM demo_plan p WHERE p.id = u.order_id;
UPDATE fabrication_order_stages s SET started_at = s.started_at - p.done, finished_at = s.finished_at - p.done
  FROM demo_plan p WHERE p.id = s.order_id;
UPDATE fabrication_order_items i SET created_at = i.created_at - p.done
  FROM demo_plan p WHERE p.id = i.order_id;
-- Retazos que nacieron en la orden, y las piezas que se consumieron en ella
UPDATE material_pieces mp SET created_at = mp.created_at - p.done
  FROM demo_plan p WHERE mp.source_order_id = p.id AND mp.company_id = :company;
UPDATE material_pieces mp SET closed_at = mp.closed_at - p.done
  FROM demo_plan p, fabrication_order_pieces u
 WHERE u.order_id = p.id AND u.piece_id = mp.id AND mp.closed_at IS NOT NULL;
UPDATE sales s SET created_at = s.created_at - p.done
  FROM demo_plan p WHERE p.sale_id = s.id;
UPDATE stock_session_lines l SET created_at = l.created_at - p.done
  FROM demo_plan p WHERE l.warehouse_id IN (SELECT id FROM demo_wh) AND l.notes LIKE p.notes;

COMMIT;
