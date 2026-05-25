const { Return, ReturnItem, Sale, Customer, Employee } = require("../models");
const { Op } = require("sequelize");

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 30, search = "", date_from, date_to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (date_from) where.created_at = { ...where.created_at, [Op.gte]: new Date(date_from) };
    if (date_to)   where.created_at = { ...where.created_at, [Op.lte]: new Date(date_to + "T23:59:59") };

    const { count, rows } = await Return.findAndCountAll({
      where,
      include: [
        {
          model: Sale,
          attributes: ["id", "invoice_number", "exchange_rate"],
          include: [{ model: Customer, attributes: ["id", "name", "rif"], required: false }],
        },
        { model: ReturnItem, attributes: ["name", "qty", "price", "subtotal"] },
        { model: Employee, attributes: ["full_name"], required: false },
      ],
      order: [["created_at", "DESC"]],
      limit:  parseInt(limit),
      offset,
      distinct: true,
    });

    let data = rows.map(r => r.toJSON());

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(r =>
        (r.nc_number || "").toLowerCase().includes(q) ||
        (r.Sale?.Customer?.name || "").toLowerCase().includes(q) ||
        String(r.Sale?.id || "").includes(q) ||
        (r.Sale?.invoice_number || "").toLowerCase().includes(q)
      );
    }

    res.json({ data, total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
