const bcrypt = require("bcryptjs");
const { Employee, Role, EmployeeWarehouse, Warehouse, Sequelize } = require("../models");
const { isAdmin, employeeWarehouseIds } = require("../middleware/auth");
const { MODULES, ALL_KEYS } = require("../config/permissions");
const { invalidateEmployee } = require("../utils/loginEvents");

const { Op } = Sequelize;

const safeEmp = (e) => {
  const data = e.toJSON ? e.toJSON() : { ...e };
  delete data.password_hash;
  return data;
};

// Un rol con `all` es administrador: manda sobre toda la empresa, no sobre una sucursal.
// Quien gestiona usuarios sin ser admin no puede crear ni ascender a uno —sería darse a sí
// mismo, por interpuesta persona, el acceso que no tiene.
const roleIsAdmin = (role) => !!role?.permissions?.all;

// Empleados que comparten al menos un almacén con quien consulta.
async function colleaguesOf(req) {
  const mine = await employeeWarehouseIds(req.employee?.id);
  if (!mine.length) return [];
  const rows = await EmployeeWarehouse.findAll({
    where: { warehouse_id: { [Op.in]: mine } },
    attributes: ['employee_id'],
    raw: true,
  });
  return [...new Set(rows.map(r => r.employee_id))];
}

// Guarda para editar/eliminar: el objetivo tiene que estar en la sucursal de quien opera y
// no puede ser administrador. Devuelve el empleado o null si no se puede tocar.
async function targetEditable(req, id) {
  const employee = await Employee.findByPk(id, { include: [{ model: Role, attributes: ['permissions'] }] });
  if (!employee) return { error: { status: 404, message: "Empleado no encontrado" } };
  if (isAdmin(req)) return { employee };

  if (roleIsAdmin(employee.Role)) {
    return { error: { status: 403, message: "No puedes gestionar usuarios administradores" } };
  }
  const allowed = await colleaguesOf(req);
  if (!allowed.includes(employee.id)) {
    return { error: { status: 403, message: "Ese usuario no pertenece a tu sucursal" } };
  }
  return { employee };
}

// GET /api/employees
const getAll = async (req, res) => {
  try {
    const where = {};
    // Fuera del admin, la lista se limita a la propia sucursal y deja fuera a los
    // administradores: no son "personal de la sucursal" y no se pueden gestionar desde aquí.
    if (!isAdmin(req)) {
      where.id = { [Op.in]: await colleaguesOf(req) };
    }

    const employees = await Employee.findAll({
      where,
      attributes: { exclude: ['password_hash'] },
      include: [
        { model: Role, attributes: ['id', 'name', 'label', 'permissions'] },
        { model: Warehouse, attributes: ['id', 'name'], through: { attributes: [] } },
      ],
      order: [['full_name', 'ASC']]
    });

    const data = employees
      .map(e => {
        const emp = e.toJSON();
        emp.role_id    = emp.Role?.id    ?? emp.role_id;
        emp.role_name  = emp.Role?.name  ?? null;
        emp.role_label = emp.Role?.label ?? null;
        emp.is_admin   = roleIsAdmin(emp.Role);
        emp.warehouses = emp.Warehouses ?? [];
        delete emp.Role;
        delete emp.Warehouses;
        return emp;
      })
      .filter(emp => isAdmin(req) || !emp.is_admin);

    // Intentos rechazados de los últimos 30 días: es la señal que se pinta en la lista. Una
    // sola consulta agrupada sobre el índice (company_id, created_at).
    if (req.company_id && data.length) {
      const { sequelize } = require("../models");
      const rows = await sequelize.query(
        `SELECT employee_id, COUNT(*)::int AS failed, MAX(created_at) AS last_failed_at
           FROM login_events
          WHERE company_id = :cid AND result <> 'ok' AND employee_id IS NOT NULL
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY employee_id`,
        { replacements: { cid: req.company_id }, type: sequelize.QueryTypes.SELECT }
      );
      const byEmp = new Map(rows.map(r => [r.employee_id, r]));
      for (const emp of data) {
        emp.failed_logins_30d   = byEmp.get(emp.id)?.failed ?? 0;
        emp.last_failed_login_at = byEmp.get(emp.id)?.last_failed_at ?? null;
      }
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener empleados" });
  }
};

// GET /api/employees/permissions — catálogo de módulos y acciones.
// La pantalla de Roles se dibuja con esto: agregar un permiso al catálogo lo hace aparecer
// en la interfaz sin tocar el frontend.
//
// Fábrica y Cocina solo se ofrecen a la empresa que tiene el módulo: en las demás serían
// casillas que no abren nada.
const getPermissionCatalog = async (req, res) => {
  let fabrica = false, cocina = false, pedidosWeb = false;
  try {
    if (req.company_id) {
      const { Company } = require("../models");
      const c = await Company.findByPk(req.company_id, { attributes: ['fabrica_enabled', 'cocina_enabled', 'pedidos_web_enabled'] });
      fabrica = !!c?.fabrica_enabled;
      cocina = !!c?.cocina_enabled;
      pedidosWeb = !!c?.pedidos_web_enabled;
    }
  } catch { /* sin la empresa, el catálogo sale sin los módulos extra */ }
  const data = MODULES
    .filter(m => (m.key !== 'factory' || fabrica) && (!['kitchen', 'tables'].includes(m.key) || cocina))
    // Confirmar pagos reportados es del extra de pedidos web: sin él la casilla no abriría nada.
    .map(m => (m.key === 'accounting' && !pedidosWeb ? { ...m, actions: m.actions.filter(a => a.key !== 'confirm') } : m));
  res.json({ ok: true, data });
};

// GET /api/employees/roles
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      attributes: ['id', 'name', 'label', 'permissions'],
      order: [['id', 'ASC']]
    });
    // El rol de administrador no se ofrece a quien no lo es: si no aparece en la lista,
    // tampoco aparece en el selector del alta.
    const data = isAdmin(req) ? roles : roles.filter(r => !roleIsAdmin(r));
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener roles" });
  }
};

// Asigna los almacenes de un empleado. Para quien no es admin, los suyos mandan: un usuario
// creado desde una sucursal nace en esa sucursal, sin pasar por un formulario que podría
// apuntar a otra.
async function syncWarehouses(req, employeeId, warehouseIds) {
  let ids;
  if (isAdmin(req)) {
    ids = (warehouseIds || []).map(Number).filter(Number.isInteger);
  } else {
    const mine = await employeeWarehouseIds(req.employee?.id);
    ids = Array.isArray(warehouseIds) && warehouseIds.length
      // Aun eligiendo, solo puede repartir entre los almacenes que él mismo tiene.
      ? warehouseIds.map(Number).filter(w => mine.includes(w))
      : mine;
  }
  if (!ids.length) return;

  await EmployeeWarehouse.destroy({ where: { employee_id: employeeId } });
  for (const warehouse_id of ids) {
    await EmployeeWarehouse.create({ employee_id: employeeId, warehouse_id });
  }
}

// POST /api/employees
const create = async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role_id, warehouse_ids } = req.body;
    if (!username || !password || !full_name || !role_id)
      return res.status(400).json({ ok: false, message: "username, password, full_name y role_id son requeridos" });
    if (password.length < 6)
      return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres" });

    const role = await Role.findByPk(role_id);
    if (!role) return res.status(400).json({ ok: false, message: "Rol no encontrado" });
    if (!isAdmin(req) && roleIsAdmin(role)) {
      return res.status(403).json({ ok: false, message: "No puedes crear usuarios administradores" });
    }
    // Sin almacén propio no hay sucursal a la que casar al nuevo usuario.
    if (!isAdmin(req) && !(await employeeWarehouseIds(req.employee?.id)).length) {
      return res.status(403).json({ ok: false, message: "No tienes ningún almacén asignado para crear usuarios" });
    }

    const hash = await bcrypt.hash(password, 10);
    const employee = await Employee.create({
      username,
      password_hash: hash,
      full_name,
      email: email || null,
      phone: phone || null,
      role_id
    });

    await syncWarehouses(req, employee.id, warehouse_ids);

    res.status(201).json({ ok: true, data: safeEmp(employee) });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return res.status(409).json({ ok: false, message: "El username o email ya existe" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear empleado" });
  }
};

// PUT /api/employees/:id
const update = async (req, res) => {
  try {
    const { full_name, email, phone, role_id, active, password, warehouse_ids } = req.body;

    if (req.employee.id === parseInt(req.params.id) && !req.employee.permissions?.all)
      return res.status(403).json({ ok: false, message: "No puedes editar tu propio perfil de esta forma" });

    const { employee, error } = await targetEditable(req, req.params.id);
    if (error) return res.status(error.status).json({ ok: false, message: error.message });

    if (role_id) {
      const role = await Role.findByPk(role_id);
      if (!role) return res.status(400).json({ ok: false, message: "Rol no encontrado" });
      if (!isAdmin(req) && roleIsAdmin(role)) {
        return res.status(403).json({ ok: false, message: "No puedes asignar el rol de administrador" });
      }
    }

    const updates = { full_name, email: email || null, phone: phone || null, role_id, active: active ?? true };

    if (password) {
      if (password.length < 6)
        return res.status(400).json({ ok: false, message: "Contraseña debe tener al menos 6 caracteres" });
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    await employee.update(updates);
    // Si se acaba de inactivar, su próxima request ya no espera los 30 s de la caché.
    invalidateEmployee(employee.id);
    if (warehouse_ids !== undefined) await syncWarehouses(req, employee.id, warehouse_ids);

    res.json({ ok: true, data: safeEmp(employee) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar empleado" });
  }
};

// DELETE /api/employees/:id
const remove = async (req, res) => {
  try {
    if (req.employee.id === parseInt(req.params.id))
      return res.status(400).json({ ok: false, message: "No puedes eliminarte a ti mismo" });

    const { employee, error } = await targetEditable(req, req.params.id);
    if (error) return res.status(error.status).json({ ok: false, message: error.message });

    await employee.destroy();
    invalidateEmployee(employee.id);
    res.json({ ok: true, message: "Empleado eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar empleado" });
  }
};

// GET /api/employees/:id/access — últimos accesos e intentos de un empleado.
// Mismo alcance que editarlo: un encargado ve el historial de su sucursal y nunca el de un
// administrador.
const getAccess = async (req, res) => {
  try {
    const { employee, error } = await targetEditable(req, req.params.id);
    if (error) return res.status(error.status).json({ ok: false, message: error.message });

    const { sequelize } = require("../models");
    const events = await sequelize.query(
      `SELECT id, kind, result, ip, user_agent, created_at
         FROM login_events
        WHERE employee_id = :id
        ORDER BY created_at DESC
        LIMIT 100`,
      { replacements: { id: employee.id }, type: sequelize.QueryTypes.SELECT }
    );
    res.json({ ok: true, data: {
      last_login_at: employee.last_login_at,
      last_seen_at:  employee.last_seen_at,
      active:        employee.active,
      events,
    } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener los accesos" });
  }
};

// PUT /api/employees/roles/:id
const updateRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ ok: false, message: "Rol no encontrado" });

    const { label, permissions } = req.body;
    if (role.name === "admin")
      return res.status(400).json({ ok: false, message: "No se puede modificar el rol admin" });

    const updates = {};
    if (label) updates.label = label;
    if (permissions) {
      // Se guardan solo las claves del catálogo: una clave inventada quedaría muerta en la
      // base y nadie sabría por qué ese permiso no hace nada.
      const limpio = {};
      for (const [k, v] of Object.entries(permissions)) {
        if (v && ALL_KEYS.includes(k)) limpio[k] = true;
      }
      updates.permissions = limpio;
    }

    await role.update(updates);
    res.json({ ok: true, data: role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar el rol" });
  }
};

module.exports = { getAll, getRoles, create, update, remove, updateRole, getPermissionCatalog, getAccess };