const { Promotion, Product, PromotionProduct, sequelize } = require("../models");
const { Op } = require("sequelize");
const { broadcast } = require("../services/sseService");

// Una promoción cambia lo que la caja descuenta, y el servidor la revalida al facturar: si el
// carrito no se entera, muestra un total y la factura sale con otro. Se reutiliza el aviso de
// productos, que es el que la caja ya escucha para refrescar precios y promociones.
const avisarCajas = (req) => broadcast(req.employee?.company_id ?? 0, 'products:updated', {});

// La pantalla manda días del calendario ("2026-09-30"). Guardados tal cual quedaban a
// medianoche UTC, que en Caracas son las 20:00 del día ANTERIOR: una promo "hasta el 30"
// dejaba de aplicarse en caja el 29 a las 8 de la noche, y una "desde el 1" arrancaba el
// 30 a esa hora. Aquí "desde" es el primer instante de ese día y "hasta" el último, en la
// hora de la empresa. Un valor que ya trae hora (no solo fecha) se respeta tal cual.
const TZ = process.env.DB_TIMEZONE || 'America/Caracas';
const offsetDe = (dia) => {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dia}T12:00:00Z`)).find(p => p.type === 'timeZoneName')?.value || '';
  return v.match(/GMT([+-]d{2}:d{2})/)?.[1] || '+00:00';
};
const soloFecha = (s) => typeof s === 'string' && /^d{4}-d{2}-d{2}$/.test(s);
const inicioDelDia = (s) => soloFecha(s) ? new Date(`${s}T00:00:00${offsetDe(s)}`) : s;
const finDelDia = (s) => soloFecha(s) ? new Date(`${s}T23:59:59.999${offsetDe(s)}`) : s;

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
    // La caja pide las de su sucursal: las de esa tienda más las que corren en todas. Sin
    // sucursal en la consulta solo quedan las generales — mejor mostrar de menos que ofrecer
    // un descuento que después el servidor no va a aplicar.
    const wid = parseInt(req.query.warehouse_id, 10) || null;
    const alcance = wid
      ? { [Op.or]: [{ warehouse_id: null }, { warehouse_id: wid }] }
      : { warehouse_id: null };
    const promos = await Promotion.findAll({
      where: {
        active: true,
        starts_at: { [Op.lte]: now },
        [Op.and]: [
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
          alcance,
        ],
      },
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id'] }],
      // La caja aplica la PRIMERA promoción que encuentra para un producto (ver
      // promoLineDiscountUsd en CartContext). Sin un orden fijo, cuál gana cuando hay dos
      // sobre el mismo producto lo decidía la base: podía cambiar entre consultas, y ahora
      // que la vitrina pública también publica el descuento, esa ambigüedad haría que el
      // catálogo anuncie un precio y la caja cobre otro.
      //
      // Manda la más reciente. Es la regla que espera quien acaba de cargar una promoción
      // nueva sobre un producto que ya estaba en oferta.
      order: [['starts_at', 'DESC'], ['id', 'DESC']],
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
    const { name, type, discount_pct, buy_qty, get_qty, starts_at, ends_at, active, product_ids = [], warehouse_id } = req.body;
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
      starts_at: inicioDelDia(starts_at),
      ends_at: ends_at ? finDelDia(ends_at) : null,
      active: active !== false,
      // Sin sucursal, corre en todas. Es el caso normal, así que la pantalla manda vacío.
      warehouse_id: parseInt(warehouse_id, 10) || null,
    }, { transaction: t });

    await PromotionProduct.bulkCreate(
      product_ids.map(pid => ({ promotion_id: promo.id, product_id: pid })),
      { transaction: t }
    );
    await t.commit();

    const full = await Promotion.findByPk(promo.id, {
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id', 'name'] }],
    });
    avisarCajas(req);
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
    const { name, type, discount_pct, buy_qty, get_qty, starts_at, ends_at, active, product_ids, warehouse_id } = req.body;

    const promo = await Promotion.findByPk(id, { transaction: t });
    if (!promo) { await t.rollback(); return res.status(404).json({ ok: false, message: "Promoción no encontrada" }); }

    await promo.update({
      name: name?.trim() || promo.name,
      type,
      discount_pct: discount_pct || null,
      buy_qty: buy_qty || null,
      get_qty: get_qty || null,
      starts_at: inicioDelDia(starts_at),
      ends_at: ends_at ? finDelDia(ends_at) : null,
      active,
      // `undefined` deja la sucursal como estaba; vacío o 0 la devuelve a "todas".
      warehouse_id: warehouse_id === undefined ? promo.warehouse_id : (parseInt(warehouse_id, 10) || null),
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
    avisarCajas(req);
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
    avisarCajas(req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getActive, create, update, remove };
