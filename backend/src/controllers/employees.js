const bcrypt = require("bcrypt");
const pool   = require("../db/pool");

const safeEmp = (e) => {
  const { password_hash, ...rest } = e;
  return rest;
};

// GET /api/employees
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.username, e.full_name, e.email, e.phone, e.active, e.created_at,
              r.id AS role_id, r.name AS role_name, r.label AS role_label
       FROM employees e JOIN roles r ON r.id = e.role_id
       ORDER BY e.full_name ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener empleados" });
  }
};

// GET /api/employees/roles
const getRoles = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, label FROM roles ORDER BY id");
    res.json({ ok: true, data: rows });
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
    const { rows } = await pool.query(
      `INSERT INTO employees (username, password_hash, full_name, email, phone, role_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [username, hash, full_name, email || null, phone || null, role_id]
    );
    res.status(201).json({ ok: true, data: safeEmp(rows[0]) });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ ok: false, message: "El username o email ya existe" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear empleado" });
  }
};

// PUT /api/employees/:id
const update = async (req, res) => {
  try {
    const { full_name, email, phone, role_id, active, password } = req.body;

    // No permitir que un no-admin cambie su propio rol
    if (req.employee.id === parseInt(req.params.id) && !req.employee.permissions?.all)
      return res.status(403).json({ ok: false, message: "No puedes editar tu propio perfil de esta forma" });

    let query, params;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ ok: false, message: "Contraseña debe tener al menos 6 caracteres" });
      const hash = await bcrypt.hash(password, 10);
      query  = `UPDATE employees SET full_name=$1, email=$2, phone=$3, role_id=$4, active=$5, password_hash=$6 WHERE id=$7 RETURNING *`;
      params = [full_name, email||null, phone||null, role_id, active ?? true, hash, req.params.id];
    } else {
      query  = `UPDATE employees SET full_name=$1, email=$2, phone=$3, role_id=$4, active=$5 WHERE id=$6 RETURNING *`;
      params = [full_name, email||null, phone||null, role_id, active ?? true, req.params.id];
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });
    res.json({ ok: true, data: safeEmp(rows[0]) });
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
    const { rowCount } = await pool.query("DELETE FROM employees WHERE id=$1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, message: "Empleado no encontrado" });
    res.json({ ok: true, message: "Empleado eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar empleado" });
  }
};

module.exports = { getAll, getRoles, create, update, remove };
