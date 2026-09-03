const { Setting, Product, Category, Currency, Customer, Sale, SaleItem, ProductComboItem, ProductStock, Warehouse, CatalogBanner, Promotion, BenefitTag, Company, Sequelize, sequelize } = require("../models");
const { tenantStorage } = require("../utils/tenantStorage");
const { imageUrl } = require("../utils/imageStorage");
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
  if (!row?.company_id) return null;

  // El catálogo público es un extra que enciende el superusuario por empresa (ver Gestión
  // de Empresas), no algo que la propia empresa se active desde su panel. Una tienda puede
  // tener tema, banners y slug configurados de sobra y aun así no responder en público si
  // nadie le prendió este interruptor — por eso se revalida acá y no solo al guardar el
  // slug, que es donde vivía el único control hasta ahora.
  const company = await Company.findByPk(row.company_id, { attributes: ["catalog_enabled"] });
  if (!company?.catalog_enabled) return null;

  return row.company_id;
}

// Datos de cabecera de la tienda. Se exponen solo campos de vitrina: nombre, logo y
// contacto. Nada de RIF, correo interno, planes ni configuración operativa.
const PUBLIC_SETTING_KEYS = [
  "store_name", "store_slogan", "store_address", "store_city",
  "store_phone", "store_phone2", "logo_filename",
  "catalog_whatsapp", "catalog_orders_enabled",
  "brand_color", "catalog_brand_color", "catalog_theme", "catalog_panel_color", "catalog_bg_color",
  // Contenido de vitrina que edita el comercio (ver controllers/catalogBanners.js para el
  // carrusel, que por llevar archivos vive en su propia tabla).
  "catalog_announcement_text", "catalog_announcement_link",
  "catalog_instagram", "catalog_facebook", "catalog_menu", "catalog_highlights",
];

// Con qué maquetación se pinta la vitrina. El valor es el nombre de un tema del frontend
// (ver pages/catalogThemes/index.js), no una ruta ni un archivo: aquí solo se comprueba que
// tenga forma de nombre, y es el frontend el que decide si lo conoce. Deliberadamente no se
// valida contra la lista de temas existentes — mantener el mismo catálogo de nombres en los
// dos lados obligaría a tocar el servidor por cada tema nuevo, y olvidarlo dejaría a una
// tienda con la vitrina cambiada sin que nadie sepa por qué. Un nombre que el frontend no
// reconozca cae al tema estándar.
const themeName = (raw) => {
  const clean = String(raw || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(clean) ? clean : null;
};

// Enlaces que se publican en la vitrina: los del anuncio, los de los banners y los de las
// redes. Solo http(s) o rutas internas — un `javascript:` guardado en un ajuste se
// ejecutaría en el navegador de cada cliente que lo tocara. Se valida al publicar y no solo
// al guardar: una fila vieja o tocada a mano nunca pasó por la validación del panel.
const colorValido = (raw) => {
  const s = String(raw || "").trim();
  return /^#?[0-9a-fA-F]{6}$/.test(s) ? s : null;
};

// La descripción larga, partida en párrafos por línea en blanco. La usan tanto la ficha del
// producto (getProduct) como el listado (getProducts) — este último se la manda al modal de
// "personalizar" del tema de menú, que abre directo desde la fila y nunca pasa por getProduct.
const splitParagraphs = (raw) => String(raw || "").split(/\n{2,}|\r\n{2,}/)
  .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12);

const publicLink = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return null;
  return (/^https?:\/\//i.test(s) || s.startsWith("/")) ? s.slice(0, 500) : null;
};

// Menú destacado de la cabecera: qué categorías aparecen y con qué etiqueta ("Nuevo",
// "Best Seller"). Se guarda como JSON en un ajuste porque no lleva archivos y siempre se lee
// y escribe entero.
//
// Se resuelve contra las categorías que existen HOY: una categoría borrada desaparece del
// menú sola, en vez de dejar un enlace que no lleva a ningún lado. Un JSON ilegible se
// ignora y la tienda queda con la cabecera estándar — nunca tumba el catálogo.
function parseMenu(raw, categories) {
  let list;
  try { list = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(list)) return [];

  const byId = new Map(categories.map((c) => [c.id, c]));
  return list.slice(0, 10).map((entry) => {
    const cat = byId.get(parseInt(entry?.category_id, 10));
    if (!cat) return null;
    return {
      category_id: cat.id,
      // La etiqueta que se muestra puede ser distinta al nombre interno de la categoría
      // ("KITS POCION" en la tienda, "KITS" en el sistema).
      label: String(entry?.label || cat.name).trim().slice(0, 30) || cat.name,
      badge: String(entry?.badge || "").trim().slice(0, 20) || null,
    };
  }).filter(Boolean);
}

// Frases cortas de presentación de la marca ("Fórmulas naturales", "Envío a todo el país"),
// el bloque que separa el carrusel de la vitrina de la lista de productos. Sin ellas ni
// eslogan, esa sección no se publica: no hay nada que inventar en su lugar.
function parseHighlights(raw) {
  let list;
  try { list = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => String(t || "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
}

// wa.me solo acepta el número en dígitos, con código de país y sin signos. El comercio
// suele escribirlo como lo tiene en la agenda ("+58 414-555 00 00"), así que se limpia
// aquí en vez de exigirle un formato exacto en el formulario.
function normalizeWhatsapp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

async function getStore(token, { warehouse_id } = {}) {
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

    // La sucursal, si ya se conoce. Esta ruta se llama dos veces: al entrar al catálogo, sin
    // sucursal todavía porque el cliente no la ha elegido, y otra vez apenas la elige (ver
    // usePublicCatalog), para que las categorías se corrijan contra lo que ESA tienda tiene.
    //
    // A diferencia de getProducts, un id inválido aquí NO revienta la carga: getStore es lo
    // primero que se pide al abrir el enlace, y si el cliente llegó con un id de sucursal
    // viejo en el navegador, la página entera no puede caerse por eso — simplemente se
    // comporta como si no se hubiera elegido ninguna.
    const whPedido = parseInt(warehouse_id, 10) || null;
    const tienda = whPedido
      ? await Warehouse.findOne({ where: { id: whPedido, active: true, sells: true }, attributes: ["id"] })
      : null;
    const whId = tienda ? tienda.id : null;

    // Solo las categorías que hoy tienen algo publicado. Un chip que al pulsarlo muestra
    // "no se encontraron productos" hace ver la tienda vacía o rota.
    //
    // Con sucursal elegida, "tener algo publicado" es tener algo publicado EN ESA sucursal —
    // el mismo criterio EXISTS que usa getProducts para decidir qué surtido le corresponde a
    // cada tienda, copiado literal para que las dos pantallas no puedan discrepar. Sin esto,
    // una sucursal sin inventario en una categoría la seguía mostrando en "Nuestras
    // categorías" solo porque OTRA sucursal de la misma empresa sí tenía algo ahí.
    const whereCategorias = { visible_in_catalog: true, sellable: true, category_id: { [Op.ne]: null } };
    if (whId) {
      whereCategorias[Op.and] = [
        Sequelize.literal(
          `EXISTS (SELECT 1 FROM product_stock ps WHERE ps.product_id = "Product"."id" AND ps.warehouse_id = ${whId})`
        ),
      ];
    }
    // Con el conteo en la misma consulta: el tema de menú lo muestra en cada mosaico
    // ("3 productos"), y separar eso en una segunda consulta solo para tener el número
    // sería un viaje más a la base por un dato que ya está aquí agrupado.
    const conteoPorCategoria = await Product.findAll({
      where: whereCategorias,
      attributes: ["category_id", [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]],
      group: ["category_id"],
    });
    const countMap = new Map(conteoPorCategoria.map((r) => [r.category_id, parseInt(r.get("count"), 10)]));
    const usedCategoryIds = [...countMap.keys()];

    const categories = usedCategoryIds.length
      ? await Category.findAll({
          where: { id: { [Op.in]: usedCategoryIds } },
          attributes: ["id", "name", "image_filename", "short_description"],
          order: [["name", "ASC"]],
        })
      : [];

    // Carrusel de portada. Solo lo activo y en el orden que fijó el comercio: un banner
    // apagado sigue en la base porque las campañas vuelven, pero no sale a la calle.
    const banners = await CatalogBanner.findAll({
      where: { active: true },
      attributes: ["id", "image_filename", "image_mobile_filename", "link_url", "alt_text"],
      order: [["sort_order", "ASC"], ["id", "ASC"]],
    });

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
        // Color de la vitrina. Manda el propio del catálogo y, si no lo hay, el de la
        // empresa — que es como funcionaba antes de que se pudieran separar.
        //
        // Se separan porque no son la misma decisión: el del sistema lo eligió alguien para
        // pasar el día trabajando dentro del ERP, y suele ser un tono sobrio; el de la
        // vitrina es la cara de la tienda de cara al cliente y puede querer ser mucho más
        // vivo sin que eso tiña la caja, los reportes y los botones de todo el sistema.
        //
        // Se valida el formato: es un valor que va directo a las variables CSS de la página
        // pública, y no debe poder inyectarse nada más que un color.
        brand_color: colorValido(s.catalog_brand_color) || colorValido(s.brand_color),
        // Fondo del panel de contenido del tema de menú (donde viven la foto de categoría,
        // las pestañas y la lista de platos). Es una decisión de la tienda, no del sistema:
        // el fondo oscuro de la página sí es fijo (identidad del tema), pero este panel es
        // "papel sobre la mesa" y cada restaurante lo quiere de un tono distinto. null = el
        // tema usa un tono neutro por defecto.
        panel_color: colorValido(s.catalog_panel_color),
        // Fondo de página y cabecera del tema de menú. Distinto del panel: uno es "la mesa",
        // el otro es "el mantel" — la tienda los quiere combinar a su gusto, no que el
        // sistema decida un negro fijo para todas. null = el tema usa su tono por defecto.
        bg_color: colorValido(s.catalog_bg_color),
        theme: themeName(s.catalog_theme),
        // Franja de anuncio sobre la cabecera ("Compra hoy y paga a cuotas"). Sin texto no
        // hay franja: una barra vacía solo roba alto de pantalla en un teléfono.
        announcement: String(s.catalog_announcement_text || "").trim()
          ? {
              text: String(s.catalog_announcement_text).trim().slice(0, 160),
              link: publicLink(s.catalog_announcement_link),
            }
          : null,
        socials: {
          instagram: publicLink(s.catalog_instagram),
          facebook: publicLink(s.catalog_facebook),
        },
        highlights: parseHighlights(s.catalog_highlights),
      },
      // Categorías destacadas en la cabecera, con su etiqueta. Vacío = cabecera estándar.
      menu: parseMenu(s.catalog_menu, categories),
      banners: banners.map((b) => ({
        id: b.id,
        image_url: imageUrl(b.image_filename),
        // Sin arte de móvil se reusa el de escritorio: el tema no tiene que saber si la
        // tienda subió las dos versiones o una sola.
        image_mobile_url: imageUrl(b.image_mobile_filename) || imageUrl(b.image_filename),
        link_url: publicLink(b.link_url),
        alt_text: b.alt_text || null,
      })),
      currencies: currencies.map((c) => ({
        code: c.code,
        symbol: c.symbol,
        exchange_rate: parseFloat(c.exchange_rate),
        is_base: c.is_base,
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        // Para la sección de categorías con foto. null = la vitrina la muestra sin imagen.
        image_url: imageUrl(c.image_filename),
        // Ambos son del tema de menú: la frase bajo el nombre y el "N productos" del
        // mosaico. Los demás temas los reciben igual y simplemente no los usan.
        short_description: c.short_description || null,
        product_count: countMap.get(c.id) || 0,
      })),
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

// Descuentos vigentes que la vitrina puede publicar, indexados por producto.
//
// Solo las promociones de porcentaje. Las de "lleva 3, paga 2" quedan fuera a propósito: no
// se pueden expresar como un precio tachado y, sobre todo, el pedido web se registra por
// líneas con su precio —no reparte unidades gratis—, así que anunciarlas aquí prometería al
// cliente un total que el pedido no va a reflejar. Se siguen aplicando en la caja como
// siempre.
//
// La regla de cuál manda cuando hay varias es la MISMA que la del punto de venta: la primera
// del listado ordenado por más reciente (ver controllers/promotions.js y promoLineDiscountUsd
// en CartContext). Si las dos pantallas eligieran distinto, el catálogo anunciaría un precio
// y la caja cobraría otro.
async function descuentosVigentes(warehouseId) {
  const now = new Date();
  const alcance = warehouseId
    ? { [Op.or]: [{ warehouse_id: null }, { warehouse_id: warehouseId }] }
    : { warehouse_id: null };

  const promos = await Promotion.findAll({
    where: {
      active: true,
      type: "percentage",
      starts_at: { [Op.lte]: now },
      [Op.and]: [
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
        alcance,
      ],
    },
    include: [{ model: Product, through: { attributes: [] }, attributes: ["id"] }],
    order: [["starts_at", "DESC"], ["id", "DESC"]],
  });

  // La primera que toque cada producto gana; las siguientes no lo pisan.
  const porProducto = {};
  for (const promo of promos) {
    const pct = parseFloat(promo.discount_pct);
    if (!(pct > 0) || pct >= 100) continue;
    for (const prod of promo.Products || []) {
      if (porProducto[prod.id]) continue;
      porProducto[prod.id] = { pct, name: promo.name };
    }
  }
  return porProducto;
}

// Precio final de una línea con su descuento aplicado. Se redondea a 2 decimales, que es la
// precisión con que se muestra y con que se totaliza el pedido: sin esto el total del carrito
// del cliente y el de la venta pueden separarse por céntimos.
function aplicarDescuento(precio, descuento) {
  if (!descuento) return { price: precio, price_before: null, discount_pct: null };
  const final = Math.round(precio * (1 - descuento.pct / 100) * 100) / 100;
  // Un descuento que no baja el precio (un producto de céntimos) se descarta: tachar un
  // precio para mostrar el mismo número al lado es ruido.
  if (!(final < precio)) return { price: precio, price_before: null, discount_pct: null };
  return { price: final, price_before: precio, discount_pct: descuento.pct };
}

async function getProducts(token, { search, category_id, limit = 40, offset = 0, warehouse_id, featured = false }) {
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
    // Y el precio, igual: la vitrina de una tienda tiene que mostrar lo que esa tienda cobra.
    // Sin sucursal elegida no hay a quién preguntarle: rige el del catálogo.
    const priceExpr = whId
      ? `COALESCE((SELECT price FROM product_stock WHERE product_id = "Product"."id" AND warehouse_id = ${whId}), "Product"."price")`
      : '"Product"."price"';
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

    // Las promociones vigentes se necesitan antes de la consulta cuando se pide la
    // sección de destacados (para filtrar por ellas) y después, para el precio de cada
    // fila — es la misma cuenta, se calcula una sola vez y se reusa para las dos cosas.
    const descuentos = await descuentosVigentes(whId);

    // "Destacados" = lo que la propia tienda ya decidió resaltar: un combo (siempre es
    // una oferta armada) o un producto con descuento vigente. No es una nueva bandera que
    // el comercio tenga que mantener aparte — sale sola de datos que ya existen.
    if (featured) {
      const conDescuento = Object.keys(descuentos).map((id) => parseInt(id, 10));
      where[Op.or] = [
        { is_combo: true },
        { id: { [Op.in]: conDescuento.length ? conDescuento : [-1] } },
      ];
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      // Se seleccionan solo columnas de vitrina. cost_price, profit_margin, barcode y
      // min_stock quedan fuera a propósito: son datos internos del negocio.
      attributes: [
        "id", "name", "unit", "image_filename", "is_service", "is_combo",
        // Campos de vitrina: la marca sobre el nombre y la frase de beneficio debajo.
        // description también: el tema de menú abre su modal de "personalizar" (nota +
        // cantidad) directo desde esta fila, sin pasar por getProduct, así que si un
        // producto no tiene frase corta pero sí descripción larga, esta es la única fuente
        // de la que ese modal la puede tomar.
        "brand", "short_description", "description",
        // "stock" y "price" pasan a ser los de la sucursal elegida, no los del negocio.
        [Sequelize.literal(stockExpr), "stock"],
        [Sequelize.literal(priceExpr), "price"],
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
        const precio = aplicarDescuento(parseFloat(j.price), descuentos[j.id]);

        return {
          id: j.id,
          name: j.name,
          // Con descuento vigente, `price` ya es el rebajado y `price_before` el anterior,
          // que es el que se tacha. El pedido se registra con esta misma cuenta (ver
          // createOrder): lo que el cliente ve es lo que se le cobra.
          price: precio.price,
          price_before: precio.price_before,
          discount_pct: precio.discount_pct,
          unit: j.unit,
          brand: j.brand || null,
          short_description: j.short_description || null,
          description_paragraphs: splitParagraphs(j.description),
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

// Ficha pública de UN producto: /catalogo/<tienda>/p/<id>. Es el destino de un enlace que
// viaja por WhatsApp, así que responde null (→ 404) para cualquier cosa que no deba verse:
// producto de otra empresa (el hook de tenant lo filtra), despublicado o insumo. Un enlace
// viejo a un producto que la tienda ocultó debe morir en 404, no revelar la ficha.
async function getProduct(token, productId, { warehouse_id } = {}) {
  const company_id = await resolveCompanyId(token);
  if (!company_id) return null;

  return tenantStorage.run({ company_id }, async () => {
    const id = parseInt(productId, 10);
    if (!Number.isInteger(id)) return null;

    const p = await Product.findOne({
      where: { id, visible_in_catalog: true, sellable: true },
      // Mismo criterio de vitrina que el listado, más los textos largos de la ficha.
      attributes: [
        "id", "name", "unit", "image_filename", "is_service", "is_combo",
        "brand", "short_description", "description",
        "stock", "price", "category_id",
      ],
      include: [
        { model: Category, attributes: ["id", "name"], required: false },
        // Los beneficios son la lista reusable (ver BenefitTag), no texto del producto: se
        // traen por la relación y no de una columna.
        { model: BenefitTag, attributes: ["name"], through: { attributes: [] }, required: false },
      ],
    });
    if (!p) return null;

    // La misma revalidación de sucursal que el listado: un id inventado no filtra nada.
    const whPedido = parseInt(warehouse_id, 10) || null;
    const tienda = whPedido
      ? await Warehouse.findOne({ where: { id: whPedido, active: true, sells: true }, attributes: ["id"] })
      : null;
    if (whPedido && !tienda) {
      const e = new Error("La tienda seleccionada no está disponible."); e.status = 400; throw e;
    }

    let stock = parseFloat(p.stock || 0);
    let basePrice = parseFloat(p.price);
    if (tienda) {
      const ficha = await ProductStock.findOne({
        where: { warehouse_id: tienda.id, product_id: p.id },
        attributes: ["qty", "price"],
      });
      // Sin ficha en esa sucursal, el producto no es de su surtido: el mismo criterio con
      // que el listado lo excluye. El enlace compartido desde otra sucursal da 404 aquí.
      if (!ficha && !p.is_service && !p.is_combo) return null;
      if (ficha) {
        stock = parseFloat(ficha.qty);
        if (ficha.price != null) basePrice = parseFloat(ficha.price);
      }
    }

    const comboStock = p.is_combo ? (await comboAvailability([p.id], tienda?.id || null))[p.id] : null;
    const available = p.is_service
      ? true
      : p.is_combo
        ? (comboStock === null || comboStock > 0)
        : stock > 0;

    const descuentos = await descuentosVigentes(tienda ? tienda.id : null);
    const precio = aplicarDescuento(basePrice, descuentos[p.id]);

    return {
      id: p.id,
      name: p.name,
      price: precio.price,
      price_before: precio.price_before,
      discount_pct: precio.discount_pct,
      unit: p.unit,
      brand: p.brand || null,
      short_description: p.short_description || null,
      // Los párrafos ya separados: el navegador no tiene por qué saber cómo se guardó.
      description_paragraphs: splitParagraphs(p.description),
      benefits: (p.BenefitTags || []).map((t) => t.name),
      category: p.Category ? { id: p.Category.id, name: p.Category.name } : null,
      image_url: p.image_filename
        ? (p.image_filename.startsWith("http") ? p.image_filename : `/uploads/${p.image_filename}`)
        : null,
      // El booleano, nunca la cantidad: mismo trato que el listado.
      available,
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
  // Al cliente se le dice que su pedido está cerrado, no cómo se cerró por dentro: el motivo
  // de una exoneración es un dato interno de la tienda.
  exonerado: { stage: "pagado",    label: "Cerrado",    detail: "Sin saldo pendiente" },
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
      include: [{ model: SaleItem, attributes: ["name", "quantity", "price", "subtotal", "note"], required: false }],
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
            note: i.note || null,
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

    // Las promociones vigentes de esa tienda, para cerrar el pedido a precio de vitrina.
    const descuentos = await descuentosVigentes(tienda ? tienda.id : null);

    // Existencias de esa tienda, en dos consultas: una para los productos simples y otra
    // para lo que necesitan los combos. Cada sucursal responde por lo que tiene.
    const stockEnTienda = {};
    const precioEnTienda = {};
    const comboEnTienda = {};
    if (tienda) {
      const filas = await ProductStock.findAll({
        where: { warehouse_id: tienda.id, product_id: { [Op.in]: ids } },
        // El precio sale de la misma consulta: el pedido tiene que cerrarse al precio de la
        // tienda que el cliente eligió, el mismo que le mostró la vitrina.
        attributes: ["product_id", "qty", "price"],
      });
      for (const r of filas) {
        stockEnTienda[r.product_id] = parseFloat(r.qty);
        if (r.price != null) precioEnTienda[r.product_id] = parseFloat(r.price);
      }

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

      // El mismo precio que vio en la vitrina, descuento incluido: el de su sucursal, y
      // encima la promoción vigente. Se recalcula aquí en vez de creerle al navegador —una
      // promoción pudo vencer con la pestaña abierta— pero por la misma cuenta, así que el
      // total del pedido coincide con el que el cliente tenía en pantalla.
      const base = precioEnTienda[p.id] ?? parseFloat(p.price);
      const price = aplicarDescuento(base, descuentos[p.id]).price;
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

      // Nota de esta línea ("sin cebolla"), distinta de la nota del pedido entero. Va a la
      // comanda de cocina, así que se sanea igual que cualquier texto que termina en un papel
      // térmico: recortado y sin más control que el salto de línea, que ahí no sirve de nada.
      const lineNote = String(line.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || null;

      enriched.push({ product: p, qty, price, note: lineNote });
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
            // En mayúsculas y sin espacios de sobra, igual que una ficha creada desde el POS:
            // el nombre lo teclea el visitante en su teléfono y llegaba como lo escribiera.
            name: String(name ?? "").trim().replace(/\s+/g, " ").toUpperCase() || null,
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
          note: e.note,
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
  getStore, getProducts, getProduct, identifyCustomer, getMyOrders, createOrder,
  SLUG_KEY, LEGACY_TOKEN_KEY, slugify, isValidSlug,
};