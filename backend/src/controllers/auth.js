const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { Employee, Role, Warehouse } = require("../models");

const SECRET  = process.env.JWT_SECRET || "supersecretkey_change_in_production";
const EXPIRES = "12h";

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
        { model: Warehouse, attributes: ['id', 'name'], through: { attributes: [] } }
      ]
    });

    if (!emp || !emp.active)
      return res.status(401).json({ ok: false, message: "Usuario no encontrado o inactivo" });

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!valid)
      return res.status(401).json({ ok: false, message: "Contraseña incorrecta" });

    const payload = {
      id:           emp.id,
      username:     emp.username,
      full_name:    emp.full_name,
      role:         emp.Role?.name  ?? null,
      role_label:   emp.Role?.label ?? null,
      permissions:  emp.Role?.permissions ?? {},
      warehouses:   emp.Warehouses || [],
      company_id:   emp.company_id,
      is_superuser: !!emp.is_superuser
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
    const refresh_token = jwt.sign({ id: emp.id, company_id: emp.company_id }, SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, refresh_token, employee: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error en el servidor" });
  }
};

// GET /api/auth/me
const me = (req, res) => {
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

    if (!emp || !emp.active) return res.status(401).json({ ok: false, message: "Usuario inválido o inactivo" });

    const payload = {
      id:           emp.id,
      username:     emp.username,
      full_name:    emp.full_name,
      role:         emp.Role?.name  ?? null,
      role_label:   emp.Role?.label ?? null,
      permissions:  emp.Role?.permissions ?? {},
      warehouses:   emp.Warehouses || [],
      company_id:   emp.company_id,
      is_superuser: !!emp.is_superuser
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
    const new_refresh_token = jwt.sign({ id: emp.id, company_id: emp.company_id }, SECRET, { expiresIn: '7d' });

    res.json({ ok: true, token, refresh_token: new_refresh_token });
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Refresh token inválido o expirado" });
  }
};

module.exports = { login, me, changePassword, refresh };
