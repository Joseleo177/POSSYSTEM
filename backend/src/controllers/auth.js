const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { Employee, Role, Warehouse, Company } = require("../models");
const { recordLoginEvent, invalidateEmployee, RESULT } = require("../utils/loginEvents");
const { effectivePermissions } = require("../config/permissions");

const SECRET  = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');
const EXPIRES = "12h";

// Sucursales entre las que el usuario elige al entrar y en el selector de la barra. El admin
// (y el superusuario) no está atado a almacenes: elige entre todas las activas de la empresa.
// El resto, entre las suyas. `sells` distingue un depósito, que no factura.
async function sucursalesDe({ company_id, is_superuser, permissions, warehouses }) {
  if (is_superuser || permissions?.all) {
    if (!company_id) return [];
    const rows = await Warehouse.findAll({
      where: { company_id, active: true },
      attributes: ['id', 'name', 'sells'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true,
    });
    return rows.map(w => ({ id: w.id, name: w.name, sells: w.sells !== false }));
  }
  return (warehouses || [])
    .filter(w => w.active !== false)
    .map(w => ({ id: w.id, name: w.name, sells: w.sells !== false }));
}

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ ok: false, message: "Usuario y contraseña requeridos" });

    const emp = await Employee.findOne({
      where: { username },
      include: [
        { model: Role, attributes: ['name', 'label', 'permissions'] },
        { model: Warehouse, attributes: ['id', 'name', 'active', 'sells'], through: { attributes: [] } }
      ]
    });

    // Cada intento queda anotado, también los rechazados: lo que el dueño quiere saber de un
    // usuario inactivo es justamente si sigue intentando entrar. Al inactivo se le comprueba
    // la contraseña para distinguir a la persona de alguien que solo prueba su usuario.
    if (!emp) {
      await recordLoginEvent(req, { username, kind: "login", result: RESULT.UNKNOWN });
      return res.status(401).json({ ok: false, message: "Usuario no encontrado o inactivo" });
    }

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!emp.active) {
      await recordLoginEvent(req, { employee: emp, kind: "login", result: valid ? RESULT.INACTIVE : RESULT.BAD_PASSWORD });
      return res.status(401).json({ ok: false, message: "Usuario no encontrado o inactivo" });
    }
    if (!valid) {
      await recordLoginEvent(req, { employee: emp, kind: "login", result: RESULT.BAD_PASSWORD });
      return res.status(401).json({ ok: false, message: "Contraseña incorrecta" });
    }

    // Verificación de suscripción de la empresa
    if (!emp.is_superuser && emp.company_id) {
      const company = await Company.findByPk(emp.company_id, {
        attributes: ['id', 'active', 'subscription_status', 'expires_at']
      });

      let bloqueo = null;
      if (!company || !company.active) {
        bloqueo = "Tu empresa ha sido desactivada. Contacta al administrador.";
      } else if (company.subscription_status === 'Suspendida') {
        bloqueo = "La suscripción de tu empresa está suspendida. Contacta al administrador.";
      } else if (company.expires_at && new Date(company.expires_at) < new Date()) {
        bloqueo = "La suscripción de tu empresa ha expirado. Renueva tu plan para continuar.";
      }
      if (bloqueo) {
        await recordLoginEvent(req, { employee: emp, kind: "login", result: RESULT.BLOCKED });
        return res.status(403).json({ ok: false, message: bloqueo });
      }
    }

    const payload = {
      id:           emp.id,
      username:     emp.username,
      full_name:    emp.full_name,
      role:         emp.Role?.name  ?? null,
      role_label:   emp.Role?.label ?? null,
      // Los del rol con las excepciones de esta persona (permisos por usuario).
      permissions:  effectivePermissions(emp.Role?.permissions, emp.permission_overrides),
      warehouses:   emp.Warehouses || [],
      company_id:   emp.company_id,
      is_superuser: !!emp.is_superuser
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
    const refresh_token = jwt.sign({ id: emp.id, company_id: emp.company_id }, SECRET, { expiresIn: '7d' });
    await recordLoginEvent(req, { employee: emp, kind: "login", result: RESULT.OK });
    invalidateEmployee(emp.id);
    const sucursales = await sucursalesDe({
      company_id: emp.company_id, is_superuser: emp.is_superuser,
      permissions: payload.permissions, warehouses: emp.Warehouses,
    });
    res.json({ ok: true, token, refresh_token, employee: { ...payload, sucursales } });
  } catch (err) {
    // El detalle queda en el log; al cliente solo un mensaje genérico. El login es un
    // endpoint público: el mensaje de error de Sequelize nombra tablas, columnas y hasta
    // el host de la base, y es justo lo primero que se prueba desde fuera.
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
};

// GET /api/auth/me
// Los permisos van al día, no los del token: un permiso concedido por migración o desde la
// pantalla de Roles tardaba hasta 12 h (lo que vive el token) en aparecer en la app. Pasó con
// `sales.discount`: el cajero con sesión abierta dejaba de ver el descuento que el servidor sí le
// aceptaba. Si la consulta falla, se responde con lo del token, como antes.
const me = async (req, res) => {
  try {
    // Los almacenes también se leen de la base y no del token: el token se firma al entrar, y
    // un almacén creado o asignado después no aparecía en Catálogo hasta cerrar sesión.
    const emp = await Employee.findByPk(req.employee.id, {
      attributes: ["id", "permission_overrides"], include: [
        { model: Role, attributes: ["name", "label", "permissions"] },
        { model: Warehouse, attributes: ["id", "name", "active", "sells"], through: { attributes: [] } },
      ],
    });
    if (emp?.Role) {
      const permissions = effectivePermissions(emp.Role.permissions, emp.permission_overrides);
      const sucursales = await sucursalesDe({
        company_id: req.company_id, is_superuser: req.is_superuser, permissions, warehouses: emp.Warehouses,
      });
      return res.json({ ok: true, employee: {
        ...req.employee,
        role: emp.Role.name, role_label: emp.Role.label, permissions,
        warehouses: (emp.Warehouses || []).map(w => ({ id: w.id, name: w.name })),
        sucursales,
      } });
    }
  } catch { /* se cae a lo del token */ }
  res.json({ ok: true, employee: req.employee });
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ ok: false, message: "Campos requeridos" });
    if (new_password.length < 6)
      return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres" });

    const emp = await Employee.findByPk(req.employee.id);
    if (!emp) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });

    const valid = await bcrypt.compare(current_password, emp.password_hash);
    if (!valid) return res.status(401).json({ ok: false, message: "Contraseña actual incorrecta" });

    const hash = await bcrypt.hash(new_password, 10);
    await emp.update({ password_hash: hash });
    
    res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al cambiar contraseña" });
  }
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(401).json({ ok: false, message: "Refresh token requerido" });

    const decoded = jwt.verify(refresh_token, SECRET);
    const emp = await Employee.findByPk(decoded.id, {
      include: [
        { model: Role, attributes: ['name', 'label', 'permissions'] },
        { model: Warehouse, attributes: ['id', 'name'], through: { attributes: [] } }
      ]
    });

    if (!emp || !emp.active) {
      // Una sesión abierta de un usuario inactivo que intenta seguir: es el caso que más
      // interesa ver en su historial.
      if (emp) await recordLoginEvent(req, { employee: emp, kind: "refresh", result: RESULT.INACTIVE });
      return res.status(401).json({ ok: false, message: "Usuario inválido o inactivo" });
    }

    const payload = {
      id:           emp.id,
      username:     emp.username,
      full_name:    emp.full_name,
      role:         emp.Role?.name  ?? null,
      role_label:   emp.Role?.label ?? null,
      // Los del rol con las excepciones de esta persona (permisos por usuario).
      permissions:  effectivePermissions(emp.Role?.permissions, emp.permission_overrides),
      warehouses:   emp.Warehouses || [],
      company_id:   emp.company_id,
      is_superuser: !!emp.is_superuser
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
    const new_refresh_token = jwt.sign({ id: emp.id, company_id: emp.company_id }, SECRET, { expiresIn: '7d' });
    await recordLoginEvent(req, { employee: emp, kind: "refresh", result: RESULT.OK });

    res.json({ ok: true, token, refresh_token: new_refresh_token });
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Refresh token inválido o expirado" });
  }
};

module.exports = { login, me, changePassword, refresh };
