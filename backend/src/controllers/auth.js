const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { Employee, Role, Warehouse, Company } = require("../models");
const { recordLoginEvent, invalidateEmployee, RESULT } = require("../utils/loginEvents");
const { effectivePermissions } = require("../config/permissions");
const { esClaveDebil, problemasClave } = require("../utils/passwordPolicy");

const SECRET  = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');
const EXPIRES = "12h";

// Sucursales entre las que el usuario elige al entrar y en el selector de la barra. El admin
// (y el superusuario) no está atado a almacenes: elige entre todas las sucursales activas de la
// empresa. Los depósitos (`sells === false`) no cuentan como sucursal de trabajo.
async function sucursalesDe({ company_id, is_superuser, permissions, warehouses }) {
  let lista;
  if (is_superuser || permissions?.all) {
    if (!company_id) return [];
    const rows = await Warehouse.findAll({
      where: { company_id, active: true },
      attributes: ['id', 'name', 'sells'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true,
    });
    lista = rows.map(w => ({ id: w.id, name: w.name, sells: w.sells !== false }));
  } else {
    lista = (warehouses || [])
      .filter(w => w.active !== false)
      .map(w => ({ id: w.id, name: w.name, sells: w.sells !== false }));
  }
  const soloSucursales = lista.filter(w => w.sells !== false);
  return soloSucursales.length ? soloSucursales : lista;
}

// Los dos tokens llevan la versión de las sesiones del empleado (`tv`, employees.token_version):
// subirla en la base los invalida todos (middleware/auth.js y refresh).
function firmarSesion(payload, emp) {
  const tv = Number(emp.token_version ?? 0);
  return {
    token: jwt.sign({ ...payload, tv }, SECRET, { expiresIn: EXPIRES }),
    refresh_token: jwt.sign({ id: emp.id, company_id: emp.company_id, tv }, SECRET, { expiresIn: '7d' }),
  };
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
    // El mensaje es el mismo en los tres casos (usuario inexistente, inactivo o contraseña
    // mala): distinguirlos le diría a un atacante si el usuario existe. El detalle se guarda
    // igual en login_events para el dueño, pero no viaja al cliente.
    if (!emp) {
      await recordLoginEvent(req, { username, kind: "login", result: RESULT.UNKNOWN });
      return res.status(401).json({ ok: false, message: "Usuario o contraseña incorrectos" });
    }

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!emp.active) {
      await recordLoginEvent(req, { employee: emp, kind: "login", result: valid ? RESULT.INACTIVE : RESULT.BAD_PASSWORD });
      return res.status(401).json({ ok: false, message: "Usuario o contraseña incorrectos" });
    }
    if (!valid) {
      await recordLoginEvent(req, { employee: emp, kind: "login", result: RESULT.BAD_PASSWORD });
      return res.status(401).json({ ok: false, message: "Usuario o contraseña incorrectos" });
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

    // Es el único momento en que el servidor ve la contraseña en claro: si no cumple la regla,
    // queda marcado y la app le pide cambiarla antes de dejarlo trabajar (middleware/auth.js).
    const debil = esClaveDebil(password, { username: emp.username });
    if (debil !== emp.must_change_password) await emp.update({ must_change_password: debil });

    const { token, refresh_token } = firmarSesion(payload, emp);
    await recordLoginEvent(req, { employee: emp, kind: "login", result: RESULT.OK });
    invalidateEmployee(emp.id);
    const sucursales = await sucursalesDe({
      company_id: emp.company_id, is_superuser: emp.is_superuser,
      permissions: payload.permissions, warehouses: emp.Warehouses,
    });
    res.json({ ok: true, token, refresh_token, employee: { ...payload, sucursales, must_change_password: debil } });
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
      attributes: ["id", "permission_overrides", "must_change_password"], include: [
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
        warehouses: (emp.Warehouses || []).filter(w => w.active !== false).map(w => ({ id: w.id, name: w.name, sells: w.sells !== false })),
        sucursales,
        must_change_password: !!emp.must_change_password,
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
      return res.status(400).json({ ok: false, message: "Escribe tu contraseña actual y la nueva" });

    const emp = await Employee.findByPk(req.employee.id);
    if (!emp) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });

    const problemas = problemasClave(new_password, { username: emp.username });
    if (problemas.length) {
      return res.status(400).json({ ok: false, message: `La contraseña nueva no es segura: ${problemas[0].toLowerCase()}`, problemas });
    }

    // 400 y no 401: un 401 haría que la app intente renovar la sesión y vuelva al login.
    const valid = await bcrypt.compare(current_password, emp.password_hash);
    if (!valid) return res.status(400).json({ ok: false, message: "La contraseña actual no es correcta" });
    if (await bcrypt.compare(new_password, emp.password_hash))
      return res.status(400).json({ ok: false, message: "La contraseña nueva tiene que ser distinta de la actual" });

    // Subir la versión cierra las demás sesiones de esta persona: si le robaron la clave, el
    // intruso sale al instante. La sesión desde la que se cambia sigue con tokens nuevos.
    const hash = await bcrypt.hash(new_password, 10);
    await emp.update({ password_hash: hash, must_change_password: false, token_version: Number(emp.token_version ?? 0) + 1 });
    invalidateEmployee(emp.id);

    const { iat, exp, tv, ...payload } = req.employee; // eslint-disable-line no-unused-vars
    const { token, refresh_token } = firmarSesion(payload, emp);
    res.json({ ok: true, message: "Contraseña actualizada", token, refresh_token });
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
        { model: Warehouse, attributes: ['id', 'name', 'active', 'sells'], through: { attributes: [] } }
      ]
    });

    if (!emp || !emp.active) {
      // Una sesión abierta de un usuario inactivo que intenta seguir: es el caso que más
      // interesa ver en su historial.
      if (emp) await recordLoginEvent(req, { employee: emp, kind: "refresh", result: RESULT.INACTIVE });
      return res.status(401).json({ ok: false, message: "Usuario inválido o inactivo" });
    }
    // Sesiones cerradas (cambio de contraseña o token_version subido a mano): no se renueva.
    if ((decoded.tv ?? 0) !== Number(emp.token_version ?? 0)) {
      return res.status(401).json({ ok: false, code: "SESSION_REVOKED", message: "Tu sesión se cerró. Vuelve a entrar." });
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

    const { token, refresh_token: new_refresh_token } = firmarSesion(payload, emp);
    await recordLoginEvent(req, { employee: emp, kind: "refresh", result: RESULT.OK });

    res.json({ ok: true, token, refresh_token: new_refresh_token });
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Refresh token inválido o expirado" });
  }
};

module.exports = { login, me, changePassword, refresh };
