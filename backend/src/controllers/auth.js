const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const pool   = require("../db/pool");

const SECRET  = process.env.JWT_SECRET || "supersecretkey_change_in_production";
const EXPIRES = "12h";

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ ok: false, message: "Usuario y contraseña requeridos" });

    const { rows } = await pool.query(
      `SELECT e.*, r.name AS role_name, r.label AS role_label, r.permissions
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.username = $1`,
      [username]
    );

    const emp = rows[0];
    if (!emp || !emp.active)
      return res.status(401).json({ ok: false, message: "Usuario no encontrado o inactivo" });

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!valid)
      return res.status(401).json({ ok: false, message: "Contraseña incorrecta" });

    const payload = {
      id:          emp.id,
      username:    emp.username,
      full_name:   emp.full_name,
      role:        emp.role_name,
      role_label:  emp.role_label,
      permissions: emp.permissions,
    };

    const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
    res.json({ ok: true, token, employee: payload });
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

    const { rows } = await pool.query("SELECT password_hash FROM employees WHERE id=$1", [req.employee.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ ok: false, message: "Contraseña actual incorrecta" });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE employees SET password_hash=$1 WHERE id=$2", [hash, req.employee.id]);
    res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al cambiar contraseña" });
  }
};

module.exports = { login, me, changePassword };
