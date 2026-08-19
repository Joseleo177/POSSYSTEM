const jwt = require("jsonwebtoken");
const { tenantStorage } = require("../utils/tenantStorage");
const { getCompanyStatus, setCompanyStatus } = require("../utils/companyStatusCache");

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

  // Verificación de suscripción universal.
  //
  // Se apoya en una caché de 30 s por empresa: sin ella era una consulta a `companies` por
  // cada request de cada caja para leer una fila que cambia una vez al mes. El panel de
  // superusuario invalida la entrada al suspender, renovar o borrar, así que el corte sigue
  // siendo inmediato.
  if (!req.is_superuser && req.company_id) {
    try {
      let company = getCompanyStatus(req.company_id);
      if (!company) {
        const { Company } = require("../models");
        const row = await Company.findByPk(req.company_id, {
          attributes: ['id', 'active', 'subscription_status', 'expires_at']
        });
        // Se cachea también el "no existe" (null): si alguien anda con un token de una
        // empresa borrada, no tiene sentido repetir la consulta en cada intento.
        company = row ? row.toJSON() : { missing: true };
        setCompanyStatus(req.company_id, company);
      }

      if (company.missing) {
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

// El admin (permissions.all) y el superusuario no están atados a almacenes concretos.
const isAdmin = (req) => !!(req.is_superuser || req.employee?.permissions?.all);

// Ids de almacén asignados al empleado en employee_warehouses.
const employeeWarehouseIds = async (employeeId) => {
  if (!employeeId) return [];
  const { EmployeeWarehouse } = require("../models");
  const rows = await EmployeeWarehouse.findAll({
    where: { employee_id: employeeId },
    attributes: ['warehouse_id'],
    raw: true,
  });
  return rows.map(r => r.warehouse_id);
};

// Almacenes que el empleado puede ver en listados y reportes.
// `null` = sin restricción (admin y superusuario ven la empresa completa).
const visibleWarehouseIds = async (req) => {
  if (!req || isAdmin(req)) return null;
  return employeeWarehouseIds(req.employee?.id);
};

// Lanza 403 si el empleado no tiene asignado el almacén. Para usar dentro de un servicio,
// cuando el almacén no viene en el request sino de la fila que se está tocando (p. ej. al
// recibir una compra, el destino ya está guardado en la orden).
//
// `optional`: un almacén vacío pasa sin error (borradores que todavía no eligieron destino).
const assertWarehouseAccess = async (req, warehouseId, { optional = false } = {}) => {
  if (!req || isAdmin(req)) return;

  // isOperational: el errorHandler central solo respeta `status` en errores marcados así;
  // sin esto un 403 de acceso salía como 500.
  const fail = (message, status) =>
    Object.assign(new Error(message), { status, isOperational: true });

  const wid = parseInt(warehouseId);
  if (!wid) {
    if (optional) return;
    throw fail("Almacén no especificado", 400);
  }

  const allowed = await employeeWarehouseIds(req.employee?.id);
  if (!allowed.includes(wid)) {
    throw fail("No tienes acceso a este almacén", 403);
  }
};

// Verifica que el empleado tenga asignado el almacén sobre el que va a operar.
//
// `permit()` solo mira los flags del rol, así que cualquiera con `inventory` o `config`
// podía sumar, restar y transferir stock de CUALQUIER almacén de la empresa cambiando el
// id de la URL. El aislamiento entre empresas ya lo daba tenantStorage; esto agrega el
// aislamiento dentro de la empresa.
//
// `getId` permite leer el almacén de otro lugar del request (p. ej. el origen de una
// transferencia o el destino de una compra, que vienen en el body).
const warehouseAccess = (getId = (req) => req.params.id, opts = {}) => async (req, res, next) => {
  try {
    await assertWarehouseAccess(req, getId(req), opts);
    next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    console.error("warehouseAccess Error:", err.message);
    res.status(500).json({ ok: false, message: "No se pudo verificar el acceso al almacén" });
  }
};

module.exports = {
  auth, permit, warehouseAccess, assertWarehouseAccess,
  visibleWarehouseIds, employeeWarehouseIds, isAdmin,
};
