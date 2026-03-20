const { Serie, SerieRange, Employee, UserSerie, sequelize } = require("../models");
const { Op } = require("sequelize");

// GET /api/series  — todas con rangos y usuarios (admin)
const getAll = async (req, res) => {
  try {
    const series = await Serie.findAll({
      include: [
        { model: SerieRange, order: [['start_number', 'ASC']] },
        { model: Employee, attributes: ['id', 'full_name'], through: { attributes: [] } },
      ],
      order: [['name', 'ASC']],
    });
    res.json({ ok: true, data: series });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/series/my  — series activas del usuario autenticado
const getMy = async (req, res) => {
  try {
    const employeeId = req.employee.id;
    const series = await Serie.findAll({
      where: { active: true },
      include: [
        { model: SerieRange },
        {
          model: Employee,
          where: { id: employeeId },
          through: { attributes: [] },
          attributes: [],
          required: true,
        },
      ],
      order: [['name', 'ASC']],
    });
    res.json({ ok: true, data: series });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/series
const create = async (req, res) => {
  try {
    const { name, prefix, padding } = req.body;
    if (!name || !prefix) throw new Error("name y prefix son requeridos");
    const serie = await Serie.create({ name, prefix: prefix.toUpperCase(), padding: parseInt(padding) || 4 });
    res.json({ ok: true, data: serie });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// PUT /api/series/:id
const update = async (req, res) => {
  try {
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    const { name, prefix, padding, active } = req.body;
    await serie.update({
      name:    name    ?? serie.name,
      prefix:  prefix  ? prefix.toUpperCase() : serie.prefix,
      padding: padding ? parseInt(padding) : serie.padding,
      active:  active  !== undefined ? active : serie.active,
    });
    res.json({ ok: true, data: serie });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// DELETE /api/series/:id
const remove = async (req, res) => {
  try {
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    await serie.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// POST /api/series/:id/ranges
const addRange = async (req, res) => {
  try {
    const { start_number, end_number } = req.body;
    if (!start_number || !end_number) throw new Error("start_number y end_number son requeridos");
    const start = parseInt(start_number);
    const end   = parseInt(end_number);
    if (end <= start) throw new Error("end_number debe ser mayor que start_number");
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    const range = await SerieRange.create({ serie_id: serie.id, start_number: start, end_number: end, current_number: start });
    res.json({ ok: true, data: range });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// DELETE /api/series/ranges/:rangeId
const removeRange = async (req, res) => {
  try {
    const range = await SerieRange.findByPk(req.params.rangeId);
    if (!range) throw new Error("Rango no encontrado");
    await range.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// PUT /api/series/:id/users  — asignar empleados a la serie
const assignUsers = async (req, res) => {
  try {
    const { user_ids } = req.body;
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    await serie.setEmployees(user_ids || []);
    // Recarga con usuarios asignados
    const updated = await Serie.findByPk(serie.id, {
      include: [{ model: Employee, attributes: ['id', 'full_name'], through: { attributes: [] } }],
    });
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getMy, create, update, remove, addRange, removeRange, assignUsers };
