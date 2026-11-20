const { sequelize, Sequelize } = require("../../models");
const { imageUrl } = require("../../utils/imageStorage");
const { sanitizeDate } = require("./shared");

/**
 * Reporte / Libro de control de récipes y psicotrópicos (módulo Farmacia).
 * Devuelve cada línea vendida de medicamentos con récipe o controlados que tengan
 * registro en `sale_prescriptions` (o todas las ventas con récipe del período),
 * con datos de paciente, médico, n° de récipe y URL de la foto.
 */
module.exports = async function prescriptionsReport({
  from, to, warehouse_id, prescription_type, search, company_id, isSuperuser, allowedWarehouses,
}) {
  const filters = [`s.status <> 'anulado'`];
  const replacements = {};

  if (!isSuperuser && company_id) {
    filters.push(`sp.company_id = :company_id`);
    replacements.company_id = company_id;
  }
  const f = sanitizeDate(from);
  const t = sanitizeDate(to);
  if (f) { filters.push(`s.created_at >= :from::date`); replacements.from = f; }
  if (t) { filters.push(`s.created_at < (:to::date + INTERVAL '1 day')`); replacements.to = t; }

  const wid = parseInt(warehouse_id, 10) || null;
  if (wid) {
    filters.push(`s.warehouse_id = :wid`);
    replacements.wid = wid;
  } else if (Array.isArray(allowedWarehouses) && allowedWarehouses.length) {
    filters.push(`s.warehouse_id IN (:wids)`);
    replacements.wids = allowedWarehouses;
  }

  if (prescription_type === 'controlado' || prescription_type === 'recipe') {
    filters.push(`p.prescription_type = :ptype`);
    replacements.ptype = prescription_type;
  }

  if (search?.trim()) {
    filters.push(`(
      sp.patient_name ILIKE :q OR sp.patient_id_doc ILIKE :q
      OR sp.doctor_name ILIKE :q OR COALESCE(sp.doctor_license, '') ILIKE :q
      OR COALESCE(sp.prescription_number, '') ILIKE :q
      OR si.name ILIKE :q OR COALESCE(p.active_ingredient, '') ILIKE :q
      OR COALESCE(s.invoice_number, '') ILIKE :q
    )`);
    replacements.q = `%${search.trim()}%`;
  }

  const rows = await sequelize.query(`
    SELECT
      sp.id AS prescription_id,
      sp.sale_id,
      sp.patient_name,
      sp.patient_id_doc,
      sp.doctor_name,
      sp.doctor_license,
      sp.prescription_number,
      sp.photo_filename,
      sp.prescription_date,
      sp.notes,
      sp.approved_by,
      sp.approved_at,
      sp.created_at,
      s.invoice_number,
      s.created_at AS sale_date,
      w.name AS warehouse_name,
      e.full_name AS employee_name,
      ap.full_name AS approver_name,
      si.id AS sale_item_id,
      si.name AS product_name,
      si.quantity,
      p.unit AS unit_label,
      p.active_ingredient,
      p.concentration,
      p.prescription_type
    FROM sale_prescriptions sp
    JOIN sales s ON s.id = sp.sale_id
    JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN warehouses w ON w.id = s.warehouse_id
    LEFT JOIN employees e ON e.id = s.employee_id
    LEFT JOIN employees ap ON ap.id = sp.approved_by
    WHERE ${filters.join(' AND ')}
      AND (p.prescription_type IN ('controlado', 'recipe') OR p.id IS NULL)
    ORDER BY s.created_at DESC, sp.id DESC, si.id ASC
    LIMIT 500
  `, { replacements, type: Sequelize.QueryTypes.SELECT });

  return rows.map(r => ({
    ...r,
    quantity: parseFloat(r.quantity || 0),
    photo_url: imageUrl(r.photo_filename),
  }));
};
