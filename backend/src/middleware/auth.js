const jwt = require("jsonwebtoken");
const { tenantStorage } = require("../utils/tenantStorage");

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');

// Verifica token y carga req.employee
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ ok: false, message: "Token requerido" });

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, SECRET);
    req.employee = decoded;
    
    // Inyectar contexto tenant
    req.company_id = decoded.company_id;
    req.is_superuser = !!decoded.is_superuser;
    
    // Configurar contexto asíncrono para Sequelize (evita tener que pasar options.company_id manualmente en cada consulta)
    tenantStorage.run({ company_id: decoded.company_id, is_superuser: req.is_superuser }, () => {
      next();
    });
  } catch {
    res.status(401).json({ ok: false, message: "Token inválido o expirado" });
  }
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
