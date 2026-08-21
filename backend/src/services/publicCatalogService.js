const { Setting, Product, Category, Currency, Customer, Sale, SaleItem, ProductComboItem, ProductStock, Warehouse, Sequelize, sequelize } = require("../models");
const { tenantStorage } = require("../utils/tenantStorage");
const { calculateComboStockAndCost } = require("./products/productService");

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

// El enlace del catálogo se dirige por el nombre de la tienda —/catalogo/el-gran-terminal—
// y no por una cadena aleatoria de 32 caracteres. Un enlace que se lee es un enlace que el
// cliente reconoce: el hash largo llegaba por WhatsApp con toda la pinta de ser phishing, y
// nadie lo podía dictar por teléfono.
//
// A cambio, el catálogo pasa a ser público de verdad: el nombre de la tienda se adivina, así
// que el enlace ya no funciona como llave. Lo que protege los datos no es el enlace sino lo
// que se expone a través de él —solo campos de vitrina, ver PUBLIC_SETTING_KEYS— más los
// límites de tasa de las rutas públicas. Para dejar de publicar la tienda ahora se apaga el
// catálogo, que es una decisión explícita, en vez de rotar un secreto.
const SLUG_KEY = "public_catalog_slug";

// Clave del esquema anterior. Ya no resuelve ningún enlace: se conserva el nombre porque las
// instalaciones viejas todavía tienen la fila guardada y conviene saber de dónde salió.
const LEGACY_TOKEN_KEY = "public_catalog_token";

// "EL GRAN TERMINAL" → "el-gran-terminal". Sin acentos (viajan mal en una URL escrita a mano)
// y sin nada que no sea letra, número o guion.
// NFD parte "á" en "a" + tilde combinante; el filtro descarta esas marcas por rango de code
// point en vez de por un literal en la expresión regular, que sobrevive peor a un cambio de
// codificación del archivo.
function stripAccents(text) {
  return text.normalize("NFD").split("").filter((c) => {
    const cp = c.charCodeAt(0);
    return cp < 0x300 || cp > 0x36f;
  }).join("");
}

function slugify(raw) {
  return stripAccents(String(raw || "").replace(/ñ/gi, "n"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// Un slug tiene que poder distinguirse de un id o de una ruta suelta, y no puede quedar vacío
// cuando el nombre de la tienda es solo símbolos.
const isValidSlug = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{1,59}$/.test(s);

// El aislamiento entre empresas NO vive en las consultas: lo aplica un AsyncLocalStorage
// que normalmente activa el middleware `auth` (ver models/index.js). Estas rutas son
// públicas y no pasan por ese middleware, así que TODA consulta de datos de la tienda
// tiene que ejecutarse dentro de tenantStorage.run(). Sin eso, los hooks beforeFind no
// añaden el filtro company_id y se devolverían productos de todas las empresas.
//
// La única consulta que corre a propósito fuera del contexto es la resolución del enlace,
// que es justamente la que descubre a qué empresa pertenece.
//
// El slug se compara en minúsculas: un enlace dictado por teléfono y escrito con mayúsculas
// tiene que llevar a la misma tienda, no a un 404.
async function resolveCompanyId(slug) {
  const clean = String(slug || "").trim().toLowerCase();
  if (!isValidSlug(clean)) return null;
  const row = await Setting.findOne({ where: { key: SLUG_KEY, value: clean } });
  return row?.company_id ?? null;
}

// Datos de cabecera de la tienda. Se exponen solo campos de vitrina: nombre, logo y
// contacto. Nada de RIF, correo interno, planes ni configuración operativa.
const PUBLIC_SETTING_KEYS = [
  "store_name", "store_slogan", "store_address", "store_city",
  "store_phone", "store_phone2", "logo_filename",
  "catalog_whatsapp", "catalog_orders_enabled",
  "brand_color",
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
      where: { visible_in_catalog: true, sellable: true, category_id: { [Op.ne]: null } },
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
        // Se valida el formato aquí: es un valor que va directo a las variables CSS de la
        // página pública, y no debe poder inyectarse nada más que un color.
        brand_color: /^#?[0-9a-fA-F]{6}$/.test(String(s.brand_color || "").trim())
          ? s.brand_color.trim()
          : null,
      },
      currencies: currencies.map((c) => ({
        code: c.code,
        symbol: c.symbol,
        exchange_rate: parseFloat(c.exchange_rate),
        is_base: c.is_base,
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      // Las sucursales que atienden público. El cliente elige en cuál compra: el stock y
      // el pedido son de esa tienda, no del negocio en general. Los depósitos quedan
      // fuera —no atienden a nadie— y de cada sucursal solo sale el nombre.
      warehouses: (await Warehouse.findAll({
        where: { active: true, sells: true },
        attributes: ["id", "name"],
        order: [["sort_order", "ASC"], ["name", "ASC"]],
      })).map((w) => ({ id: w.id, name: w.name })),
    };
  });
}

// Cuántas unidades de cada combo se pueden armar hoy, indexado por id de combo. Usa la
// misma regla que el POS (el mínimo entre lo que da cada ingrediente) reutilizando
// calculateComboStockAndCost, para que la vitrina y la caja no puedan discrepar.
//
// Trabaja sobre el stock global del producto, no por almacén: un pedido del catálogo nace
// sin almacén asignado — lo elige quien lo acepta — así que aquí la pregunta es si el
// negocio puede armarlo, no si puede armarlo una sucursal concreta.
async function comboAvailability(comboIds, warehouseId) {
  if (!comboIds.length) return {};

  const links = await ProductComboItem.findAll({
    where: { combo_id: { [Op.in]: comboIds } },
    attributes: ["combo_id", "product_id", "quantity"],
  });
  if (!links.length) return Object.fromEntries(comboIds.map((id) => [id, 0]));

  const ingredientIds = [...new Set(links.map((l) => l.product_id))];
  const ingredients = await Product.findAll({
    where: { id: { [Op.in]: ingredientIds } },
    attributes: ["id", "stock", "is_service", "cost_price"],
  });
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i.toJSON()]));

  // Con sucursal elegida, lo que se puede armar depende de lo que haya EN ESA TIENDA. El
  // stock global diría que sí y el cliente se llevaría un pedido que su sucursal no puede
  // preparar.
  if (warehouseId) {
    const enTienda = await ProductStock.findAll({
      where: { warehouse_id: warehouseId, product_id: { [Op.in]: ingredientIds } },
      attributes: ["product_id", "qty"],
    });
    const qtyById = Object.fromEntries(enTienda.map((r) => [r.product_id, parseFloat(r.qty)]));
    for (const id of ingredientIds) {
      if (byId[id]) byId[id].stock = qtyById[id] ?? 0;
    }
  }

  const grouped = {};
  for (const l of links) {
    (grouped[l.combo_id] ||= []).push({ quantity: l.quantity, ingredient: byId[l.product_id] });
  }

  // Un combo sin ingredientes configurados queda en 0: createSale lo rechaza igual, así que
  // publicarlo como disponible solo genera un pedido que nadie puede cumplir.
  return Object.fromEntries(
    comboIds.map((id) => [id, grouped[id] ? calculateComboStockAndCost(grouped[id]).stock : 0])
  );
}

async function getProducts(token, { search, category_id, limit = 40, offset = 0, warehouse_id }) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    // El comercio decide producto por producto qué sale a la vitrina. Este filtro es la
    // única barrera: sin él, cualquier alta de inventario aparecería publicada.
    // sellable es cinturón y tirantes: al marcar un producto como insumo se lo despublica,
    // pero un registro viejo o tocado a mano no debe poder colarse en la vitrina.
    const where = { visible_in_catalog: true, sellable: true };
    // La sucursal llega del selector de la vitrina. Se revalida contra la empresa y contra
    // que atienda público: un id inventado no debe convertirse en un filtro cualquiera.
    const whPedido = parseInt(warehouse_id, 10) || null;
    const tienda = whPedido
      ? await Warehouse.findOne({ where: { id: whPedido, active: true, sells: true }, attributes: ["id"] })
      : null;
    // Una sucursal que no existe, está inactiva o es un depósito no puede resolverse al
    // stock global: el cliente vería disponible algo que esa tienda no tiene.
    if (whPedido && !tienda) {
      const e = new Error("La tienda seleccionada no está disponible."); e.status = 400; throw e;
    }
    const whId = tienda ? tienda.id : null;
    // Existencias de la sucursal elegida; sin sucursal, la columna global del producto.
    const stockExpr = whId
      ? `COALESCE((SELECT qty FROM product_stock WHERE product_id = "Product"."id" AND warehouse_id = ${whId}), 0)`
      : '"Product"."stock"';
    // La vitrina de una sucursal solo lista lo que esa sucursal maneja, y "manejar" es
    // tener ficha en su almacén —el mismo criterio del módulo Catálogo, para que las dos
    // pantallas den siempre el mismo surtido—. Sin esto, elegir una tienda pequeña
    // devolvía el catálogo entero de la empresa con doce AGOTADO que allí nunca se
    // vendieron. Vale para todo, incluidos servicios y combos: el alta de producto les
    // crea ficha igual, así que no hace falta exceptuarlos.
    if (whId) {
      where[Op.and] = [
        Sequelize.literal(
          `EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = "Product"."id" AND ps.warehouse_id = ${whId})`
        ),
      ];
    }
    if (category_id) where.category_id = parseInt(category_id, 10);
    if (search && String(search).trim()) {
      where.name = { [Op.iLike]: `%${String(search).trim()}%` };
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      // Se seleccionan solo columnas de vitrina. cost_price, profit_margin, barcode y
      // min_stock quedan fuera a propósito: son datos internos del negocio.
      attributes: [
        "id", "name", "price", "unit", "image_filename", "is_service", "is_combo",
        // "stock" pasa a ser el de la sucursal elegida, no el total del negocio.
        [Sequelize.literal(stockExpr), "stock"],
      ],
      include: [{ model: Category, attributes: ["name"], required: false }],
      // Disponibles primero. Es una vitrina: un cliente que abre el enlace debe ver lo que
      // puede comprar, no dos pantallas de agotados antes de llegar a algo. Como el
      // listado es paginado, el orden tiene que resolverse aquí y no en el navegador.
      //
      // Salvedad conocida: un combo cuenta como disponible para ordenar aunque no queden
      // ingredientes, porque su stock real se calcula después de paginar (ver
      // comboAvailability). Se muestra correctamente como agotado y no se puede pedir, pero
      // no baja al final de la lista. Corregirlo exige mover ese cálculo a una subconsulta.
      order: [
        [Sequelize.literal(`(CASE WHEN "Product"."is_service" OR "Product"."is_combo" OR ${stockExpr} > 0 THEN 0 ELSE 1 END)`), "ASC"],
        ["name", "ASC"],
      ],
      limit: Math.min(parseInt(limit, 10) || 40, 60),
      offset: parseInt(offset, 10) || 0,
    });

    // Un combo no tiene inventario propio: lo que se puede vender sale de sus ingredientes.
    // Antes se publicaban como disponibles siempre, y el cliente podía pedir combos que no
    // se podían armar — el comercio solo se enteraba al aceptar el pedido, cuando el
    // descuento de stock fallaba. Se resuelve para los combos de esta página con dos
    // consultas, no una por producto.
    const comboStock = await comboAvailability(rows.filter((r) => r.is_combo).map((r) => r.id), whId);

    return {
      total: count,
      products: rows.map((p) => {
        const j = p.toJSON();
        // Los servicios no llevan inventario. Los combos dependen de sus ingredientes, y
        // stock null significa que todos son servicios, o sea sin límite.
        const available = j.is_service
          ? true
          : j.is_combo
            ? (comboStock[j.id] === null || comboStock[j.id] > 0)
            : parseFloat(j.stock || 0) > 0;
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
      // Se incluye el precio de cada línea: el cliente que abre un pedido viejo quiere ver
      // qué pagó por cada cosa, no solo qué se llevó.
      include: [{ model: SaleItem, attributes: ["name", "quantity", "price", "subtotal"], required: false }],
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
          items: (j.SaleItems || []).map((i) => ({
            name: i.name,
            quantity: parseFloat(i.quantity),
            price: parseFloat(i.price),
            // subtotal es columna generada en la BD; si faltara se recompone aquí.
            subtotal: i.subtotal != null ? parseFloat(i.subtotal) : parseFloat(i.price) * parseFloat(i.quantity),
          })),
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
async function createOrder(token, { items, customer_name, customer_phone, customer_document, note, idempotency_key, warehouse_id }) {
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
    const products = await Product.findAll({ where: { id: { [Op.in]: ids }, visible_in_catalog: true, sellable: true } });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));

    // La sucursal donde compra el cliente. Se revalida acá: el pedido puede llegar con
    // cualquier cosa en el cuerpo, y de ella dependen tanto el control de existencias como
    // a qué caja le entra el pedido.
    const whPedido = parseInt(warehouse_id, 10) || null;
    const tienda = whPedido
      ? await Warehouse.findOne({ where: { id: whPedido, active: true, sells: true }, attributes: ["id", "name"] })
      : null;
    if (whPedido && !tienda) {
      const e = new Error("La tienda seleccionada ya no está disponible."); e.status = 400; throw e;
    }

    // Existencias de esa tienda, en dos consultas: una para los productos simples y otra
    // para lo que necesitan los combos. Cada sucursal responde por lo que tiene.
    const stockEnTienda = {};
    const comboEnTienda = {};
    if (tienda) {
      const filas = await ProductStock.findAll({
        where: { warehouse_id: tienda.id, product_id: { [Op.in]: ids } },
        attributes: ["product_id", "qty"],
      });
      for (const r of filas) stockEnTienda[r.product_id] = parseFloat(r.qty);

      const comboIds = products.filter((p) => p.is_combo).map((p) => p.id);
      Object.assign(comboEnTienda, await comboAvailability(comboIds, tienda.id));
    }

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

      // Cada sucursal responde por lo suyo: si la tienda elegida no tiene con qué cubrir la
      // línea, se le dice al cliente ahora y no cuando el comercio intenta aceptarlo. Se
      // nombra el producto para que pueda ajustar la cantidad o cambiar de tienda.
      if (tienda && !p.is_service) {
        const disponible = p.is_combo
          ? (comboEnTienda[p.id] === null ? Infinity : (comboEnTienda[p.id] ?? 0))
          : (stockEnTienda[p.id] ?? 0);
        if (disponible < qty) {
          const e = new Error(
            disponible > 0
              ? `En ${tienda.name} solo quedan ${disponible} de "${p.name}".`
              : `"${p.name}" no está disponible en ${tienda.name}.`
          );
          e.status = 400; throw e;
        }
      }

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

module.exports = {
  getStore, getProducts, identifyCustomer, getMyOrders, createOrder,
  SLUG_KEY, LEGACY_TOKEN_KEY, slugify, isValidSlug,
};