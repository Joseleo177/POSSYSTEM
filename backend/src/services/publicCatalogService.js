const { Setting, Product, Category, Currency, Sequelize } = require("../models");
const { tenantStorage } = require("../utils/tenantStorage");

const Op = Sequelize.Op;

const TOKEN_KEY = "public_catalog_token";

// El aislamiento entre empresas NO vive en las consultas: lo aplica un AsyncLocalStorage
// que normalmente activa el middleware `auth` (ver models/index.js). Estas rutas son
// públicas y no pasan por ese middleware, así que TODA consulta de datos de la tienda
// tiene que ejecutarse dentro de tenantStorage.run(). Sin eso, los hooks beforeFind no
// añaden el filtro company_id y se devolverían productos de todas las empresas.
//
// La única consulta que corre a propósito fuera del contexto es la resolución del token,
// que es justamente la que descubre a qué empresa pertenece.
async function resolveCompanyId(token) {
  if (!token || typeof token !== "string" || token.length < 16) return null;
  const row = await Setting.findOne({ where: { key: TOKEN_KEY, value: token } });
  return row?.company_id ?? null;
}

// Datos de cabecera de la tienda. Se exponen solo campos de vitrina: nombre, logo y
// contacto. Nada de RIF, correo interno, planes ni configuración operativa.
const PUBLIC_SETTING_KEYS = [
  "store_name", "store_slogan", "store_address", "store_city",
  "store_phone", "store_phone2", "logo_filename",
];

async function getStore(token) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const rows = await Setting.findAll({ where: { key: { [Op.in]: PUBLIC_SETTING_KEYS } } });
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const currencies = await Currency.findAll({
      where: { active: true },
      attributes: ["code", "symbol", "exchange_rate", "is_base"],
      order: [["is_base", "DESC"]],
    });

    const categories = await Category.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    return {
      store: {
        name: s.store_name || "Catálogo",
        slogan: s.store_slogan || null,
        address: [s.store_address, s.store_city].filter(Boolean).join(", ") || null,
        phone: [s.store_phone, s.store_phone2].filter(Boolean).join(" / ") || null,
        logo_url: s.logo_filename
          ? (s.logo_filename.startsWith("http") ? s.logo_filename : `/uploads/${s.logo_filename}`)
          : null,
      },
      currencies: currencies.map((c) => ({
        code: c.code,
        symbol: c.symbol,
        exchange_rate: parseFloat(c.exchange_rate),
        is_base: c.is_base,
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  });
}

async function getProducts(token, { search, category_id, limit = 40, offset = 0 }) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const where = {};
    if (category_id) where.category_id = parseInt(category_id, 10);
    if (search && String(search).trim()) {
      where.name = { [Op.iLike]: `%${String(search).trim()}%` };
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      // Se seleccionan solo columnas de vitrina. cost_price, profit_margin, barcode y
      // min_stock quedan fuera a propósito: son datos internos del negocio.
      attributes: ["id", "name", "price", "stock", "unit", "image_filename", "is_service", "is_combo"],
      include: [{ model: Category, attributes: ["name"], required: false }],
      order: [["name", "ASC"]],
      limit: Math.min(parseInt(limit, 10) || 40, 60),
      offset: parseInt(offset, 10) || 0,
    });

    return {
      total: count,
      products: rows.map((p) => {
        const j = p.toJSON();
        // Servicios y combos no llevan inventario propio, siempre se ofrecen.
        const available = j.is_service || j.is_combo || parseFloat(j.stock || 0) > 0;
        return {
          id: j.id,
          name: j.name,
          price: parseFloat(j.price),
          unit: j.unit,
          category_name: j.Category?.name || null,
          image_url: j.image_filename
            ? (j.image_filename.startsWith("http") ? j.image_filename : `/uploads/${j.image_filename}`)
            : null,
          // Se publica el booleano, nunca la cantidad: el inventario real no sale de casa.
          available,
        };
      }),
    };
  });
}

module.exports = { getStore, getProducts, TOKEN_KEY };