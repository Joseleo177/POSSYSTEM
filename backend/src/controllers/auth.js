const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { Employee, Role, Warehouse, Company } = require("../models");

const SECRET  = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');
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

    // Verificación de suscripción de la empresa
    if (!emp.is_superuser && emp.company_id) {
      const company = await Company.findByPk(emp.company_id, {
        attributes: ['id', 'active', 'subscription_status', 'expires_at']
      });

      if (!company || !company.active) {
        return res.status(403).json({ ok: false, message: "Tu empresa ha sido desactivada. Contacta al administrador." });
      }
      if (company.subscription_status === 'Suspendida') {
        return res.status(403).json({ ok: false, message: "La suscripción de tu empresa está suspendida. Contacta al administrador." });
      }
      if (company.expires_at && new Date(company.expires_at) < new Date()) {
        return res.status(403).json({ ok: false, message: "La suscripción de tu empresa ha expirado. Renueva tu plan para continuar." });
      }
    }

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
    // El detalle queda en el log; al cliente solo un mensaje genérico. El login es un
    // endpoint público: el mensaje de error de Sequelize nombra tablas, columnas y hasta
    // el host de la base, y es justo lo primero que se prueba desde fuera.
    console.error("LOGIN ERROR:", err);
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
