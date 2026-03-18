const bcrypt = require("bcrypt");
const { Employee, Role } = require("../models");

const safeEmp = (e) => {
  const data = e.toJSON ? e.toJSON() : { ...e };
  delete data.password_hash;
  return data;
};

// GET /api/employees
const getAll = async (req, res) => {
  try {
    const employees = await Employee.findAll({
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Role, attributes: ['id', 'name', 'label'] }],
      order: [['full_name', 'ASC']]
    });

    const data = employees.map(e => {
      const emp = e.toJSON();
      emp.role_id    = emp.Role?.id    ?? emp.role_id;
      emp.role_name  = emp.Role?.name  ?? null;
      emp.role_label = emp.Role?.label ?? null;
      delete emp.Role;
      return emp;
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener empleados" });
  }
};

// GET /api/employees/roles
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      attributes: ['id', 'name', 'label'],
      order: [['id', 'ASC']]
    });
    res.json({ ok: true, data: roles });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener roles" });
  }
};

// POST /api/employees
const create = async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role_id } = req.body;
    if (!username || !password || !full_name || !role_id)
      return res.status(400).json({ ok: false, message: "username, password, full_name y role_id son requeridos" });
    if (password.length < 6)
      return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres" });

    const hash = await bcrypt.hash(password, 10);
    const employee = await Employee.create({
      username,
      password_hash: hash,
      full_name,
      email: email || null,
      phone: phone || null,
      role_id
    });

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
    const { full_name, email, phone, role_id, active, password } = req.body;

    if (req.employee.id === parseInt(req.params.id) && !req.employee.permissions?.all)
      return res.status(403).json({ ok: false, message: "No puedes editar tu propio perfil de esta forma" });

    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });

    const updates = { full_name, email: email || null, phone: phone || null, role_id, active: active ?? true };

    if (password) {
      if (password.length < 6)
        return res.status(400).json({ ok: false, message: "Contraseña debe tener al menos 6 caracteres" });
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    await employee.update(updates);
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

    const employee = await Employee.findByPk(req.params.id);
    if (!employee) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });

    await employee.destroy();
    res.json({ ok: true, message: "Empleado eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar empleado" });
  }
};

module.exports = { getAll, getRoles, create, update, remove };
