const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "supersecretkey_change_in_production";

// Verifica token y carga req.employee
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ ok: false, message: "Token requerido" });

  try {
    const token = header.slice(7);
    req.employee = jwt.verify(token, SECRET);
    next();
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
