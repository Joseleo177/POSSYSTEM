const { Setting, Product, Category, Currency, Customer, Sale, SaleItem, Sequelize, sequelize } = require("../models");
const { tenantStorage } = require("../utils/tenantStorage");

const Op = Sequelize.Op;

// Topes de un pedido público. No son reglas de negocio, son límites de cordura frente a
// un formulario abierto a internet: sin ellos una petición armada a mano puede meter mil
// líneas o cantidades absurdas en la lista de trabajo del comercio.
const MAX_ORDER_LINES = 40;
const MAX_LINE_QTY    = 999;

// Cédula / RIF. El sistema los guarda como "V-12345678" (ver CustomerModal), pero un
// registro viejo o importado puede estar sin guion o en minúscula, así que para BUSCAR se
// comparan solo las letras y números. Para GUARDAR siempre se usa la forma canónica.
function parseDocument(raw) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = clean.match(/^([VEJGP])(\d{6,9})$/);
  if (!m) return null;
  return { canonical: `${m[1]}-${m[2]}`, normalized: `${m[1]}${m[2]}` };
}

// Busca un contacto por documento ignorando el formato con que esté guardado. El filtro
// por empresa lo añade el hook de tenant sobre `where`, por eso las condiciones van
// dentro de Op.and en vez de reemplazar el objeto entero.
async function findCustomerByDocument(normalized, transaction) {
  const rows = await Customer.findAll({
    where: {
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("regexp_replace", Sequelize.fn("upper", Sequelize.col("rif")), "[^A-Z0-9]", "", "g"),
          normalized
        ),
      ],
    },
    limit: 1,
    transaction,
  });
  return rows[0] || null;
}

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
  "catalog_whatsapp", "catalog_orders_enabled",
];

// wa.me solo acepta el número en dígitos, con código de país y sin signos. El comercio
// suele escribirlo como lo tiene en la agenda ("+58 414-555 00 00"), así que se limpia
// aquí en vez de exigirle un formato exacto en el formulario.
function normalizeWhatsapp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

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

    // Solo las categorías que hoy tienen algo publicado. Un chip que al pulsarlo muestra
    // "no se encontraron productos" hace ver la tienda vacía o rota.
    const usedCategoryIds = (await Product.findAll({
      where: { visible_in_catalog: true, category_id: { [Op.ne]: null } },
      attributes: ["category_id"],
      group: ["category_id"],
    })).map((r) => r.category_id);

    const categories = usedCategoryIds.length
      ? await Category.findAll({
          where: { id: { [Op.in]: usedCategoryIds } },
          attributes: ["id", "name"],
          order: [["name", "ASC"]],
        })
      : [];

    const whatsapp = normalizeWhatsapp(s.catalog_whatsapp);
    const ordersEnabled = !!whatsapp && s.catalog_orders_enabled === "true";

    return {
      store: {
        name: s.store_name || "Catálogo",
        slogan: s.store_slogan || null,
        address: [s.store_address, s.store_city].filter(Boolean).join(", ") || null,
        phone: [s.store_phone, s.store_phone2].filter(Boolean).join(" / ") || null,
        logo_url: s.logo_filename
          ? (s.logo_filename.startsWith("http") ? s.logo_filename : `/uploads/${s.logo_filename}`)
          : null,
        // Sin número configurado no hay a dónde mandar el pedido, así que el carrito
        // queda apagado aunque el ajuste esté encendido: mejor vitrina que un botón
        // que no lleva a ninguna parte.
        whatsapp: ordersEnabled ? whatsapp : null,
        orders_enabled: ordersEnabled,
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
    // El comercio decide producto por producto qué sale a la vitrina. Este filtro es la
    // única barrera: sin él, cualquier alta de inventario aparecería publicada.
    const where = { visible_in_catalog: true };
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
      // Disponibles primero. Es una vitrina: un cliente que abre el enlace debe ver lo que
      // puede comprar, no dos pantallas de agotados antes de llegar a algo. Como el
      // listado es paginado, el orden tiene que resolverse aquí y no en el navegador.
      order: [
        [Sequelize.literal('(CASE WHEN "Product"."is_service" OR "Product"."is_combo" OR "Product"."stock" > 0 THEN 0 ELSE 1 END)'), "ASC"],
        ["name", "ASC"],
      ],
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

// Identificación al entrar al catálogo: dado un documento, dice si ya hay ficha y con qué
// nombre, para que el cliente confirme que es él.
//
// Esto responde con el nombre de un tercero a quien acierte su cédula. Es una decisión
// explícita del comercio (confirmar por nombre evita fichas duplicadas por errores de
// tecleo), y el contrapeso está en el límite de peticiones de la ruta: un cliente real
// escribe su cédula una vez, un sondeo masivo se queda sin intentos enseguida.
//
// NO crea la ficha: eso ocurre al enviar el pedido. Si se creara aquí, cualquiera podría
// llenar la cartera de clientes del comercio sin comprar nada.
async function identifyCustomer(token, document) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const doc = parseDocument(document);
    if (!doc) { const e = new Error("Cédula o RIF inválido."); e.status = 400; throw e; }

    const customer = await findCustomerByDocument(doc.normalized);
    return customer
      ? { found: true, document: doc.canonical, name: customer.name, phone: customer.phone || null }
      : { found: false, document: doc.canonical };
  });
}

// Estados internos de una venta traducidos a lo que le importa al cliente. 'borrador' se
// agrupa con 'espera' a propósito: es un paso interno del cobro, no algo que el cliente
// deba distinguir. Lo que no esté en este mapa no se publica.
const ORDER_STAGES = {
  pedido:    { stage: "enviado",   label: "Enviado",   detail: "La tienda aún no lo ha confirmado" },
  espera:    { stage: "confirmado", label: "Confirmado", detail: "Tu pedido está siendo preparado" },
  borrador:  { stage: "confirmado", label: "Confirmado", detail: "Tu pedido está siendo preparado" },
  pendiente: { stage: "facturado", label: "Facturado",  detail: "Pendiente de pago" },
  parcial:   { stage: "facturado", label: "Facturado",  detail: "Con abono parcial" },
  pagado:    { stage: "pagado",    label: "Pagado",     detail: "Gracias por tu compra" },
  anulado:   { stage: "anulado",   label: "Anulado",    detail: "Este pedido fue anulado" },
};

// Historial de pedidos de un cliente, para que pueda seguir el suyo sin llamar a la
// tienda. Devuelve solo sus propias ventas y solo campos de cara al cliente: ni almacén,
// ni empleado, ni costos, ni saldos internos.
async function getMyOrders(token, document) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const doc = parseDocument(document);
    if (!doc) { const e = new Error("Cédula o RIF inválido."); e.status = 400; throw e; }

    const customer = await findCustomerByDocument(doc.normalized);
    if (!customer) return { orders: [] };

    const sales = await Sale.findAll({
      where: { customer_id: customer.id, status: { [Op.in]: Object.keys(ORDER_STAGES) } },
      attributes: ["id", "total", "status", "invoice_number", "created_at"],
      include: [{ model: SaleItem, attributes: ["name", "quantity"], required: false }],
      order: [["created_at", "DESC"]],
      limit: 15,
    });

    return {
      orders: sales.map((s) => {
        const j = s.toJSON();
        const stage = ORDER_STAGES[j.status];
        return {
          id: j.id,
          total: parseFloat(j.total),
          created_at: j.created_at,
          invoice_number: j.invoice_number || null,
          stage: stage.stage,
          stage_label: stage.label,
          stage_detail: stage.detail,
          items: (j.SaleItems || []).map((i) => ({ name: i.name, quantity: parseFloat(i.quantity) })),
        };
      }),
    };
  });
}

// Registra un pedido llegado del catálogo. Nace en status 'pedido': una venta real en la
// base de datos, pero que NO descuenta inventario todavía. Ese es el punto — el enlace es
// público, así que cualquiera podría dejar el stock en cero con pedidos falsos si el
// descuento ocurriera aquí. El inventario se mueve cuando el comercio acepta el pedido
// desde la caja (ver services/sales/acceptWebOrder.js).
async function createOrder(token, { items, customer_name, customer_phone, customer_document, note, idempotency_key }) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const rows = await Setting.findAll({ where: { key: { [Op.in]: ["catalog_whatsapp", "catalog_orders_enabled"] } } });
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!normalizeWhatsapp(s.catalog_whatsapp) || s.catalog_orders_enabled !== "true") {
      const e = new Error("Esta tienda no está recibiendo pedidos."); e.status = 403; throw e;
    }

    // Reenvío del mismo pedido (doble toque, red inestable): se devuelve el que ya existe
    // en vez de duplicar el trabajo del comercio. Se reutiliza la clave de idempotencia
    // que las ventas ya tienen, con prefijo para no chocar con las del punto de venta.
    if (idempotency_key) {
      const key = `web_${String(idempotency_key).slice(0, 58)}`;
      const existing = await Sale.findOne({ where: { idempotency_key: key } });
      if (existing) return { id: existing.id, total: parseFloat(existing.total) };
    }

    const name = String(customer_name || "").trim().slice(0, 120);
    if (name.length < 2) { const e = new Error("Indica tu nombre."); e.status = 400; throw e; }

    const phone = String(customer_phone || "").trim().slice(0, 30);
    if (phone.replace(/\D/g, "").length < 7) {
      const e = new Error("Indica un teléfono válido."); e.status = 400; throw e;
    }

    const doc = parseDocument(customer_document);
    if (!doc) {
      const e = new Error("Indica tu cédula o RIF (ej. V-12345678)."); e.status = 400; throw e;
    }

    const lines = Array.isArray(items) ? items : [];
    if (lines.length === 0) { const e = new Error("El pedido está vacío."); e.status = 400; throw e; }
    if (lines.length > MAX_ORDER_LINES) {
      const e = new Error(`Un pedido admite hasta ${MAX_ORDER_LINES} productos distintos.`); e.status = 400; throw e;
    }

    // Los precios y la disponibilidad se releen de la base: lo que mande el navegador es
    // solo una intención. Si el cliente dejó la pestaña abierta una semana, el pedido se
    // registra con el precio de hoy, no con el que tenía guardado en pantalla.
    const ids = [...new Set(lines.map((l) => parseInt(l.product_id, 10)).filter(Number.isInteger))];
    const products = await Product.findAll({ where: { id: { [Op.in]: ids }, visible_in_catalog: true } });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    const enriched = [];
    let total = 0;

    for (const line of lines) {
      const p = byId[parseInt(line.product_id, 10)];
      if (!p) { const e = new Error("Uno de los productos ya no está disponible."); e.status = 400; throw e; }

      const qty = parseFloat(line.quantity);
      if (!(qty > 0) || qty > MAX_LINE_QTY) {
        const e = new Error(`Cantidad inválida para "${p.name}".`); e.status = 400; throw e;
      }

      const price = parseFloat(p.price);
      if (!(price > 0)) { const e = new Error(`"${p.name}" no tiene precio publicado.`); e.status = 400; throw e; }

      // A propósito no se valida existencia aquí: entre que el cliente miró y envió, algo
      // pudo agotarse, y rechazarle el pedido entero por una línea es peor que dejar que
      // el comercio lo vea y decida. El stock se verifica al aceptar, que es cuando se
      // mueve de verdad.

      enriched.push({ product: p, qty, price });
      total += round2(price) * qty;
    }

    total = parseFloat(total.toFixed(2));
    const baseCurrency = await Currency.findOne({ where: { is_base: true } });

    const t = await sequelize.transaction();
    try {
      // Ficha del cliente. Si la cédula ya está registrada se enlaza la existente; si no,
      // el propio cliente crea su ficha al pedir.
      //
      // Deliberadamente NO se actualizan nombre ni teléfono de una ficha que ya existe:
      // el formulario es público, así que quien acierte una cédula ajena podría reescribir
      // los datos de un cliente real. Lo declarado en el pedido queda en los campos web_*
      // para que el comercio vea la diferencia y decida.
      let customer = await findCustomerByDocument(doc.normalized, t);
      if (!customer) {
        try {
          customer = await Customer.create({
            type: "cliente",
            name,
            phone,
            rif: doc.canonical,
            company_id,
          }, { transaction: t });
        } catch (err) {
          // Dos pedidos simultáneos con la misma cédula: el índice único (rif, company_id)
          // rechaza el segundo. La ficha ya existe, así que se usa esa.
          if (err?.name !== "SequelizeUniqueConstraintError") throw err;
          customer = await findCustomerByDocument(doc.normalized, t);
          if (!customer) throw err;
        }
      }

      const sale = await Sale.create({
        total,
        paid: 0,
        change: 0,
        // Sin empleado, sin serie y sin almacén: nadie del comercio lo atendió todavía y
        // el correlativo se asigna al facturar. El almacén lo define quien lo acepte.
        employee_id: null,
        serie_id: null,
        warehouse_id: null,
        customer_id: customer.id,
        currency_id: baseCurrency?.id || null,
        exchange_rate: 1,
        status: "pedido",
        company_id,
        idempotency_key: idempotency_key ? `web_${String(idempotency_key).slice(0, 58)}` : null,
        web_customer_name: name,
        web_customer_phone: phone || null,
        web_note: String(note || "").trim().slice(0, 500) || null,
      }, { transaction: t });

      for (const e of enriched) {
        await SaleItem.create({
          sale_id: sale.id,
          product_id: e.product.id,
          name: e.product.name,
          price: e.price,
          quantity: e.qty,
          discount: 0,
          cost_price: e.product.cost_price != null ? parseFloat(e.product.cost_price) : null,
        }, { transaction: t });
      }

      await t.commit();
      return { id: sale.id, total };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });
}

module.exports = { getStore, getProducts, identifyCustomer, getMyOrders, createOrder, TOKEN_KEY };