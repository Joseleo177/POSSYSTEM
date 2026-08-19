const { Return, ReturnItem, Sale, Customer, Employee } = require("../models");
const { Op } = require("sequelize");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../middleware/auth");

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 30, search = "", date_from, date_to, warehouse_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (date_from) where.created_at = { ...where.created_at, [Op.gte]: new Date(date_from) };
    if (date_to)   where.created_at = { ...where.created_at, [Op.lte]: new Date(date_to + "T23:59:59") };

    // La NC no guarda sucursal: la hereda de la venta que corrige, así que el filtro va
    // sobre el join con sales.
    const saleWhere = {};
    if (warehouse_id) {
      await assertWarehouseAccess(req, warehouse_id);
      saleWhere.warehouse_id = parseInt(warehouse_id);
    } else {
      const allowedWarehouses = await visibleWarehouseIds(req);
      if (allowedWarehouses) saleWhere.warehouse_id = { [Op.in]: allowedWarehouses };
    }

    const { count, rows } = await Return.findAndCountAll({
      where,
      include: [
        {
          model: Sale,
          // customer_id va en la lista aunque la pantalla no lo muestre: al pasar el include
          // a `required` con where, Sequelize resuelve el Customer anidado contra las columnas
          // seleccionadas de sales, y sin esta el JOIN falla con "Sale.customer_id does not exist".
          attributes: ["id", "invoice_number", "exchange_rate", "customer_id"],
          required: Object.keys(saleWhere).length > 0,
          ...(Object.keys(saleWhere).length ? { where: saleWhere } : {}),
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
