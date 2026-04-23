const { Sequelize } = require("../../models");
const { Op } = Sequelize;

function sanitizeDate(val) {
  if (!val) return null;
  const match = String(val).match(/^(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

function buildTenantContext(req) {
  const company_id  = req.employee?.company_id ?? null;
  const isSuperuser = !!req.is_superuser;
  const scoped      = !isSuperuser && company_id;
  return {
    company_id,
    isSuperuser,
    rep:  { cid: company_id },
    tc:   scoped ? `AND company_id = :cid`    : '',
    tcS:  scoped ? `AND s.company_id = :cid`  : '',
    tcS2: scoped ? `AND s2.company_id = :cid` : '',
    tcP:  scoped ? `AND p.company_id = :cid`  : '',
    tcC:  scoped ? `AND c.company_id = :cid`  : '',
  };
}

function dateClause(date_from, date_to, alias = '') {
  const col = alias ? `${alias}.created_at` : 'created_at';
  const parts = [];
  if (date_from) parts.push(`AND ${col} >= '${date_from}'`);
  if (date_to)   parts.push(`AND ${col} <  ('${date_to}'::date + INTERVAL '1 day')`);
  return parts.join(' ');
}

module.exports = { sanitizeDate, buildTenantContext, dateClause };
