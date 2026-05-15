const { Promotion, Product, PromotionProduct, sequelize } = require("../models");
const { Op } = require("sequelize");

const getAll = async (req, res) => {
  try {
    const promos = await Promotion.findAll({
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    });
    res.json({ ok: true, data: promos });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

const getActive = async (req, res) => {
  try {
    const now = new Date();
    const promos = await Promotion.findAll({
      where: {
        active: true,
        starts_at: { [Op.lte]: now },
        [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }],
      },
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id'] }],
    });
    const data = promos.map(p => {
      const json = p.toJSON();
      json.product_ids = (json.Products || []).map(pr => pr.id);
      delete json.Products;
      return json;
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

const create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, type, discount_pct, buy_qty, get_qty, starts_at, ends_at, active, product_ids = [] } = req.body;
    if (!name?.trim()) throw new Error("El nombre es requerido");
    if (!['percentage', 'buy_x_get_y'].includes(type)) throw new Error("Tipo inválido");
    if (type === 'percentage' && !discount_pct) throw new Error("El porcentaje es requerido");
    if (type === 'buy_x_get_y' && (!buy_qty || !get_qty)) throw new Error("Compra y lleva son requeridos");
    if (!starts_at) throw new Error("La fecha de inicio es requerida");
    if (!product_ids.length) throw new Error("Debe seleccionar al menos un producto");

    const promo = await Promotion.create({
      name: name.trim(), type,
      discount_pct: discount_pct || null,
      buy_qty: buy_qty || null,
      get_qty: get_qty || null,
      starts_at,
      ends_at: ends_at || null,
      active: active !== false,
    }, { transaction: t });

    await PromotionProduct.bulkCreate(
      product_ids.map(pid => ({ promotion_id: promo.id, product_id: pid })),
      { transaction: t }
    );
    await t.commit();

    const full = await Promotion.findByPk(promo.id, {
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id', 'name'] }],
    });
    res.status(201).json({ ok: true, data: full });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ ok: false, message: err.message });
  }
};

const update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, type, discount_pct, buy_qty, get_qty, starts_at, ends_at, active, product_ids } = req.body;

    const promo = await Promotion.findByPk(id, { transaction: t });
    if (!promo) { await t.rollback(); return res.status(404).json({ ok: false, message: "Promoción no encontrada" }); }

    await promo.update({
      name: name?.trim() || promo.name,
      type,
      discount_pct: discount_pct || null,
      buy_qty: buy_qty || null,
      get_qty: get_qty || null,
      starts_at,
      ends_at: ends_at || null,
      active,
    }, { transaction: t });

    if (Array.isArray(product_ids)) {
      await PromotionProduct.destroy({ where: { promotion_id: id }, transaction: t });
      if (product_ids.length > 0) {
        await PromotionProduct.bulkCreate(
          product_ids.map(pid => ({ promotion_id: promo.id, product_id: pid })),
          { transaction: t }
        );
      }
    }
    await t.commit();

    const full = await Promotion.findByPk(id, {
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id', 'name'] }],
    });
    res.json({ ok: true, data: full });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ ok: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const promo = await Promotion.findByPk(req.params.id);
    if (!promo) return res.status(404).json({ ok: false, message: "Promoción no encontrada" });
    await promo.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getActive, create, update, remove };
