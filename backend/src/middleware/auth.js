const jwt = require("jsonwebtoken");
const { tenantStorage } = require("../utils/tenantStorage");

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');

// Verifica token y carga req.employee
const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ ok: false, message: "Token requerido" });

  let decoded;
  try {
    const token = header.slice(7);
    decoded = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ ok: false, message: "Token inválido o expirado" });
  }

  req.employee = decoded;
  req.company_id = decoded.company_id;
  req.is_superuser = !!decoded.is_superuser;

  // Verificación de suscripción universal
  if (!req.is_superuser && req.company_id) {
    try {
      const { Company } = require("../models");
      const company = await Company.findByPk(req.company_id, {
        attributes: ['id', 'active', 'subscription_status', 'expires_at']
      });

      if (!company) {
        return res.status(403).json({ ok: false, message: "Empresa no encontrada" });
      }
      if (!company.active) {
        return res.status(403).json({ ok: false, message: "Tu empresa ha sido desactivada. Contacta al administrador." });
      }
      if (company.subscription_status === 'Suspendida') {
        return res.status(403).json({ ok: false, message: "La suscripción de tu empresa está suspendida. Contacta al administrador." });
      }
      if (company.expires_at && new Date(company.expires_at) < new Date()) {
        return res.status(403).json({ ok: false, message: "La suscripción de tu empresa ha expirado. Renueva tu plan para continuar." });
      }
    } catch (err) {
      console.error("Auth DB Error:", err.message);
      // Opcional: Podríamos bloquear con 500, pero permitimos pasar si es un simple lag de db temporal
    }
  }

  // Configurar contexto asíncrono para Sequelize (evita tener que pasar options.company_id manualmente en cada consulta)
  tenantStorage.run({ company_id: decoded.company_id, is_superuser: req.is_superuser }, () => {
    next();
  });
};


// Verifica que el empleado tenga alguno de los permisos indicados
const permit = (...perms) => (req, res, next) => {
  const { permissions } = req.employee;
  if (permissions?.all) return next();                        // admin pasa todo
  const ok = perms.some((p) => permissions?.[p]);
  if (ok) return next();
  res.status(403).json({ ok: false, message: "Sin permiso para esta acción" });
};

module.exports = { auth, permit };
