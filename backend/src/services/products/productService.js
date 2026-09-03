const path = require("path");
const fs = require("fs");
const { Product, Category, SaleItem, PurchaseItem, StockTransfer, ProductStock, Sequelize, ProductComboItem, BenefitTag, ProductBenefitTag, sequelize } = require("../../models");
const Op = Sequelize.Op;

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../../config/supabase");

function imageUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  return `/uploads/${filename}`;
}

function calculateComboStockAndCost(comboItems) {
  if (!comboItems?.length) return { stock: 0, cost: 0 };
  let minStock = Infinity;
  let totalCost = 0;
  for (const item of comboItems) {
    if (!item.ingredient) return { stock: 0, cost: 0 };
    const ingCost = parseFloat(item.ingredient.cost_price) || 0;
    const reqQty = parseFloat(item.quantity) || 1;
    totalCost += ingCost * reqQty;
    if (item.ingredient.is_service) continue; // services don't limit combo stock
    const stockModel = item.ingredient.stocks?.[0];
    const ingStock = stockModel ? parseFloat(stockModel.qty) : parseFloat(item.ingredient.stock || 0);
    const possible = Number((ingStock / reqQty).toFixed(4));
    if (possible < minStock) minStock = possible;
  }
  // all ingredients are services → unlimited stock (null)
  return { stock: minStock === Infinity ? null : minStock, cost: totalCost };
}

// Reemplaza los beneficios asignados a un producto por los recibidos. Se filtran contra las
// etiquetas de la EMPRESA antes de insertar: la tabla puente no lleva company_id (igual que
// promotion_products), así que sin este filtro un id ajeno colado a mano en la petición
// enlazaría el producto con la etiqueta de otra tienda, y su nombre se filtraría a la
// vitrina pública de esta.
//
// company_id va explícito y no por el hook de tenant: esta función corre dentro de
// createProduct/updateProduct, cuyas rutas llevan multer, y el parseo de multipart rompe el
// AsyncLocalStorage del que depende ese hook (mismo motivo por el que TODO este servicio
// recibe y pasa company_id a mano — ver la nota larga en controllers/catalogBanners.js).
async function syncBenefitTags(productId, benefit_tag_ids, company_id, t) {
  const parsed = typeof benefit_tag_ids === 'string' ? JSON.parse(benefit_tag_ids) : benefit_tag_ids;
  if (!Array.isArray(parsed)) return;

  await ProductBenefitTag.destroy({ where: { product_id: productId }, transaction: t });
  if (parsed.length === 0) return;

  const propias = await BenefitTag.findAll({
    where: { id: parsed.map((v) => parseInt(v, 10)).filter(Number.isInteger), company_id },
    attributes: ['id'],
    transaction: t,
  });
  if (!propias.length) return;

  await ProductBenefitTag.bulkCreate(
    propias.map((tag) => ({ product_id: productId, benefit_tag_id: tag.id })),
    { transaction: t }
  );
}

async function handleImageUpload(file) {
  if (!file) return null;
  if (isSupabase()) {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `product_${Date.now()}${ext}`;
    return getSupabaseStorage().uploadImage(file.buffer, filename, file.mimetype);
  }
  const uploadsDir = path.join(__dirname, "../../../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `product_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return filename;
}

async function handleImageDelete(imageValue) {
  if (!imageValue) return;
  if (isSupabase()) {
    const filename = imageValue.startsWith("http") ? imageValue.split("/").pop() : null;
    if (filename) await getSupabaseStorage().deleteImage(filename);
  }
}

async function getAll({ search, category_id, is_combo, is_service, warehouse_id, not_in_warehouse_id, stock_filter, visible_in_catalog, sellable, limit = 100, offset = 0, company_id }) {
  const where = {};
  if (company_id) where.company_id = company_id;
  if (category_id) where.category_id = category_id;
  if (is_combo !== undefined) where.is_combo = is_combo === 'true';
  if (is_service !== undefined) where.is_service = is_service === 'true';
  if (visible_in_catalog !== undefined) where.visible_in_catalog = visible_in_catalog === 'true' || visible_in_catalog === true;
  // El buscador de venta pide sellable=true; compras, inventario y transferencias no filtran,
  // porque un insumo se compra y se mueve igual que cualquier otro producto.
  if (sellable !== undefined) where.sellable = sellable === 'true' || sellable === true;

  if (not_in_warehouse_id) {
    const stocksInWarehouse = await ProductStock.findAll({
      where: { warehouse_id: parseInt(not_in_warehouse_id) },
      attributes: ['product_id'],
    });
    const associatedIds = stocksInWarehouse.map(s => s.product_id);
    if (associatedIds.length > 0) {
      where.id = { [Op.notIn]: associatedIds };
    }
  }

  if (warehouse_id || stock_filter) {
    let associatedIds = [];
    let validPhysicalIds = [];

    if (warehouse_id) {
      const stocksInWarehouse = await ProductStock.findAll({
        where: { warehouse_id: parseInt(warehouse_id) },
        attributes: ['product_id', 'qty'],
      });

      associatedIds = stocksInWarehouse.map(s => s.product_id);

      if (stock_filter === 'with') {
        validPhysicalIds = stocksInWarehouse.filter(s => parseFloat(s.qty) > 0).map(s => s.product_id);
      } else if (stock_filter === 'no') {
        validPhysicalIds = stocksInWarehouse.filter(s => parseFloat(s.qty) <= 0).map(s => s.product_id);
      } else {
        validPhysicalIds = associatedIds;
      }
    }

    const orConditions = [];

    if (warehouse_id) {
      // 1. Physical products that match the stock filter for this warehouse
      if (validPhysicalIds.length > 0) {
        orConditions.push({ is_combo: false, is_service: false, id: { [Op.in]: validPhysicalIds } });
      }

      // 2. Combos explicitly associated with this warehouse (qty doesn't matter, evaluated post-query)
      if (associatedIds.length > 0) {
        orConditions.push({ is_combo: true, id: { [Op.in]: associatedIds } });
      }

      // 3. Services explicitly associated with this warehouse
      if (stock_filter !== 'no' && associatedIds.length > 0) {
        orConditions.push({ is_service: true, id: { [Op.in]: associatedIds } });
      }

      // 4. Global Combos/Services (those created before this feature, with no ProductStock records anywhere)
      const productsWithAnyStock = await ProductStock.findAll({ attributes: ['product_id'], group: ['product_id'] });
      const idsWithAnyStock = productsWithAnyStock.map(s => s.product_id);
      const notInIds = idsWithAnyStock.length ? idsWithAnyStock : [-1];

      orConditions.push({ is_combo: true, id: { [Op.notIn]: notInIds } });
      if (stock_filter !== 'no') {
        orConditions.push({ is_service: true, id: { [Op.notIn]: notInIds } });
      }

      if (orConditions.length === 0) orConditions.push({ id: -1 });

    } else {
      if (stock_filter === 'with') {
        orConditions.push({ is_combo: false, is_service: false, stock: { [Op.gt]: 0 } });
        orConditions.push({ is_combo: true });
        orConditions.push({ is_service: true });
      } else if (stock_filter === 'no') {
        orConditions.push({ is_combo: false, is_service: false, stock: { [Op.lte]: 0 } });
        orConditions.push({ is_combo: true });
      }
    }

    if (orConditions.length > 0) {
      where[Op.or] = orConditions;
    }
  }

  const include = [
    { model: Category, attributes: ['name'], required: false },
    {
      model: ProductComboItem,
      as: 'comboItems',
      include: [{
        model: Product,
        as: 'ingredient',
        attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock', 'is_service'],
        include: warehouse_id ? [{
          model: ProductStock,
          as: 'stocks',
          where: { warehouse_id: parseInt(warehouse_id) },
          required: false,
          attributes: ['qty']
        }] : []
      }]
    }
  ];

  if (warehouse_id) {
    include.push({
      model: ProductStock,
      as: 'stocks',
      where: { warehouse_id: parseInt(warehouse_id) },
      required: false,
      // price, min_stock y cost_price salen de la misma fila: viendo un almacén, lo que vale
      // es lo que esa sucursal tenga definido.
      attributes: ['qty', 'price', 'min_stock', 'cost_price']
    });
  }

  if (search) {
    const categories = await Category.findAll({
      where: { name: { [Op.iLike]: `%${search}%` } },
      attributes: ['id']
    });
    const catIds = categories.map(c => c.id);
    const searchOr = [
      { name: { [Op.iLike]: `%${search}%` } },
      { barcode: { [Op.iLike]: `%${search}%` } },
      ...(catIds.length > 0 ? [{ category_id: { [Op.in]: catIds } }] : [])
    ];
    if (where[Op.or]) {
      // Ya existe filtro de almacén/stock — combinar ambos con AND
      where[Op.and] = [{ [Op.or]: where[Op.or] }, { [Op.or]: searchOr }];
      delete where[Op.or];
    } else {
      where[Op.or] = searchOr;
    }
  }

  const { count, rows } = await Product.findAndCountAll({
    where, include,
    order: [['name', 'ASC']],
    limit: parseInt(limit),
    offset: parseInt(offset),
    distinct: true,
  });

  const data = rows.map(p => {
    const prod = p.toJSON();
    prod.category_name = prod.Category?.name ?? null;
    delete prod.Category;
    prod.image_url = imageUrl(prod.image_filename);
    if (prod.stocks?.length > 0) {
      const ficha = prod.stocks[0];
      prod.warehouse_stock = parseFloat(ficha.qty || 0);
      // Precio y mínimo de la sucursal pisan a los del producto: quien consulta un almacén
      // —el POS, el catálogo, las etiquetas— debe ver lo que rige ahí, sin tener que saber
      // que existe una herencia detrás. Los flags `_own` son para la pantalla de stock, que
      // sí necesita distinguir lo propio de lo heredado.
      prod.price_own = ficha.price != null;
      if (prod.price_own) prod.price = ficha.price;
      prod.min_stock_own = ficha.min_stock != null;
      if (prod.min_stock_own) prod.min_stock = ficha.min_stock;
      prod.cost_own = ficha.cost_price != null;
      if (prod.cost_own) prod.cost_price = ficha.cost_price;

      // El margen se recalcula sobre el precio y el costo que acaban de quedar, que son los
      // de esta sucursal. Guardado en el producto es el del precio general, y mostrarlo junto
      // a cifras de sucursal daba un porcentaje que no se correspondía con ninguno de los dos
      // números de al lado: 54% sobre un precio y un costo que dan 30%.
      const margenSucursal = derivarMargen(prod.price, prod.cost_price, "");
      if (margenSucursal != null) prod.profit_margin = margenSucursal;

      delete prod.stocks;
    } else if (warehouse_id) {
      prod.warehouse_stock = 0;
      prod.price_own = false;
      prod.min_stock_own = false;
      prod.cost_own = false;
    }
    if (prod.is_combo) {
      const stats = calculateComboStockAndCost(prod.comboItems);
      prod.stock = stats.stock;
      prod.cost_price = stats.cost;
      if (warehouse_id !== undefined) prod.warehouse_stock = stats.stock;
    }
    return prod;
  });

  // Post-filtrar combos por su stock calculado real
  let finalData = data;
  if (stock_filter === 'no') {
    finalData = data.filter(p => !p.is_combo || (p.stock !== null && parseFloat(p.stock) <= 0));
  } else if (stock_filter === 'with') {
    finalData = data.filter(p => !p.is_combo || (p.stock !== null && parseFloat(p.stock) > 0));
  }
  const adjustedTotal = count - (data.length - finalData.length);

  return { data: finalData, total: adjustedTotal, limit: parseInt(limit), offset: parseInt(offset) };
}

async function getOne(id, company_id) {
  const product = await Product.findOne({
    where: { id, ...(company_id ? { company_id } : {}) },
    include: [
      { model: Category, attributes: ['name'], required: false },
      {
        model: ProductComboItem,
        as: 'comboItems',
        include: [{ model: Product, as: 'ingredient', attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock', 'is_service'] }]
      },
      { model: BenefitTag, attributes: ['id', 'name'], through: { attributes: [] }, required: false },
    ]
  });
  if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

  const p = product.toJSON();
  p.category_name = p.Category?.name ?? null;
  delete p.Category;
  // Solo los ids: es lo único que el modal necesita para marcar los chips seleccionados.
  p.benefit_tag_ids = (p.BenefitTags || []).map((t) => t.id);
  delete p.BenefitTags;
  p.image_url = imageUrl(p.image_filename);
  if (p.is_combo) {
    const stats = calculateComboStockAndCost(p.comboItems);
    p.stock = stats.stock;
    p.cost_price = stats.cost;
  }
  return { data: p };
}

// Margen que se desprende de un precio puesto a mano. Hay productos cuyo precio no sale de
// aplicarle un porcentaje al costo sino que se fija directo; dejar el margen vacío hacía que
// la ficha mostrara 0% de algo que sí deja ganancia.
function derivarMargen(price, cost_price, profit_margin) {
  if (String(profit_margin ?? '').trim() !== '') return profit_margin;
  const p = parseFloat(price);
  const c = parseFloat(cost_price);
  if (isNaN(p) || isNaN(c) || c <= 0 || p <= 0) return null;
  return parseFloat((((p / c) - 1) * 100).toFixed(2));
}

async function createProduct({ body, file, company_id }) {
  const { name, price, category_id, unit, qty_step,
    cost_price, profit_margin, package_size, package_unit, min_stock,
    is_combo, combo_items, is_service, barcode, warehouse_id, bulk_price,
    visible_in_catalog, sellable, brand, short_description, description, benefit_tag_ids } = body;

  if (!name || price == null) {
    const e = new Error("name y price son requeridos"); e.status = 400; throw e;
  }

  // Si el campo no viene —un alta rápida desde compras, una integración vieja— el producto
  // nace vendible, que es como se comportaba todo antes de que existiera la marca.
  const esVendible = sellable === undefined ? true : !(sellable === 'false' || sellable === false);

  if (barcode) {
    const existing = await Product.findOne({ where: { barcode, company_id } });
    if (existing) {
      const e = new Error("El código de barras ya está registrado en otro producto");
      e.status = 400;
      e.isOperational = true;
      throw e;
    }
  }

  const imageValue = await handleImageUpload(file);
  const isComboBool = is_combo === 'true' || is_combo === true;
  const isServiceBool = is_service === 'true' || is_service === true;

  const t = await sequelize.transaction();
  try {
    const product = await Product.create({
      name, price,
      stock: 0,
      category_id: category_id || null,
      image_filename: imageValue,
      unit: unit || "unidad",
      qty_step: qty_step || 1,
      cost_price: isComboBool ? null : (cost_price || null),
      profit_margin: derivarMargen(price, cost_price, profit_margin),
      package_size: package_size || null,
      package_unit: package_unit || null,
      bulk_price: bulk_price || null,
      min_stock: parseFloat(min_stock) || 0,
      is_combo: isComboBool,
      is_service: isServiceBool,
      barcode: barcode || null,
      brand: brand || null,
      short_description: short_description || null,
      description: description || null,
      // Un insumo no se publica nunca: aunque llegue marcado, se guarda apagado.
      sellable: esVendible,
      visible_in_catalog: esVendible && (visible_in_catalog === 'true' || visible_in_catalog === true),
      company_id,
    }, { transaction: t });

    if (warehouse_id) {
      await ProductStock.create({
        product_id: product.id,
        warehouse_id: parseInt(warehouse_id),
        qty: 0,
        company_id
      }, { transaction: t });
    }

    if (isComboBool && combo_items) {
      const parsedItems = typeof combo_items === 'string' ? JSON.parse(combo_items) : combo_items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        await ProductComboItem.bulkCreate(
          parsedItems.map(i => ({ combo_id: product.id, product_id: i.product_id, quantity: i.quantity, company_id })),
          { transaction: t }
        );
      }
    }

    if (benefit_tag_ids) {
      await syncBenefitTags(product.id, benefit_tag_ids, company_id, t);
    }

    await t.commit();
    return { data: { ...product.toJSON(), image_url: imageUrl(imageValue) } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function updateProduct({ id, body, file, company_id, warehouse_id = null }) {
  const { name, price, category_id, unit, qty_step,
    cost_price, profit_margin, package_size, package_unit, min_stock,
    is_combo, combo_items, is_service, barcode, bulk_price,
    visible_in_catalog, sellable, brand, short_description, description, benefit_tag_ids } = body;

  // Editar el catálogo parado en una sucursal cambia el precio DE ESA SUCURSAL, no el de
  // todas. Un encargado de área maneja su tienda y no debería mover —ni enterarse de— las
  // demás. El precio del producto queda como el de referencia con que nació y como el que
  // heredan las sucursales que no fijaron uno propio.
  const alcanceSucursal = !!warehouse_id;

  const t = await sequelize.transaction();
  try {
    const product = await Product.findByPk(id, { transaction: t });
    if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

    // Sin el campo en la petición se conserva lo que ya tenía.
    const esVendible = sellable === undefined
      ? product.sellable
      : !(sellable === 'false' || sellable === false);

    if (barcode && barcode !== product.barcode) {
      const existing = await Product.findOne({ where: { barcode, company_id }, transaction: t });
      if (existing) {
        const e = new Error("El código de barras ya está registrado en otro producto");
        e.status = 400;
        e.isOperational = true;
        throw e;
      }
    }

    let currentImageValue = product.image_filename;
    if (file) {
      await handleImageDelete(currentImageValue);
      currentImageValue = await handleImageUpload(file);
    } else if (body.remove_image === "true") {
      await handleImageDelete(currentImageValue);
      currentImageValue = null;
    }

    const isComboBool = is_combo === 'true' || is_combo === true || (is_combo === undefined ? product.is_combo : false);
    const isServiceBool = is_service === 'true' || is_service === true || (is_service === undefined ? product.is_service : false);

    // Campo ausente = no se toca; campo presente pero vacío = se vacía a propósito.
    //
    // Antes se reemplazaba el producto entero con lo que trajera el cuerpo, así que una
    // petición parcial —un guardado desde otra pantalla, una integración— le borraba el
    // costo, el embalaje o el código de barras sin que nadie lo pidiera. El modal manda
    // siempre el formulario completo y por eso no se notaba.
    const opt = (valor, actual, vacio = null) => {
      if (valor === undefined) return actual;
      return valor === "" || valor === null ? vacio : valor;
    };

    const precioFinal = opt(price, product.price, product.price);
    const costoFinal  = isComboBool ? null : opt(cost_price, product.cost_price);
    // El margen manda solo si viene escrito; si no, se recalcula. Conservar el anterior
    // dejaba fichas que se contradicen —62% con un precio que sobre ese costo da 35%—, y el
    // margen es justamente lo que se mira para saber cuánto deja el producto.
    const margenExplicito = profit_margin !== undefined && String(profit_margin).trim() !== "";
    const margenFinal = margenExplicito
      ? parseFloat(profit_margin)
      : derivarMargen(precioFinal, costoFinal, "");

    // Con alcance de sucursal, los tres valores que tienen ficha propia —precio, costo y
    // mínimo— no se tocan en el producto: se escriben más abajo en `product_stock`. Lo demás
    // (nombre, categoría, unidad, código de barras, combo) es del producto y sigue siendo
    // igual para todas las sucursales, porque no tendría sentido de otro modo.
    await product.update({
      name: opt(name, product.name, product.name),
      price: alcanceSucursal ? product.price : precioFinal,
      category_id: opt(category_id, product.category_id),
      image_filename: currentImageValue,
      unit: opt(unit, product.unit, "unidad"),
      qty_step: opt(qty_step, product.qty_step, 1),
      stock: (isComboBool || isServiceBool) ? 0 : product.stock,
      cost_price: alcanceSucursal ? product.cost_price : costoFinal,
      profit_margin: alcanceSucursal ? product.profit_margin : margenFinal,
      package_size: opt(package_size, product.package_size),
      package_unit: opt(package_unit, product.package_unit),
      bulk_price: opt(bulk_price, product.bulk_price),
      min_stock: alcanceSucursal
        ? product.min_stock
        : (min_stock === undefined ? product.min_stock : (parseFloat(min_stock) || 0)),
      is_combo: isComboBool,
      is_service: isServiceBool,
      barcode: opt(barcode, product.barcode),
      // Campos de vitrina. Con `opt` para que un guardado que no los mande —una edición
      // rápida desde otra pantalla— no borre lo que la tienda ya escribió.
      brand: opt(brand, product.brand),
      short_description: opt(short_description, product.short_description),
      description: opt(description, product.description),
      // Sin el campo en el cuerpo se conserva lo que ya tenía: hay flujos que guardan el
      // producto sin pasar por el modal completo y no deben despublicarlo por omisión.
      sellable: esVendible,
      // Marcar el producto como insumo lo baja del catálogo en el mismo movimiento.
      visible_in_catalog: !esVendible ? false : (visible_in_catalog === undefined
        ? product.visible_in_catalog
        : (visible_in_catalog === 'true' || visible_in_catalog === true)),
    }, { transaction: t });

    // ── Lo que es de la sucursal, a la ficha de la sucursal ──────────────────────────
    if (warehouse_id) {
      const ficha = await ProductStock.findOne({
        where: { warehouse_id, product_id: product.id },
        transaction: t,
        lock: true,
      });

      {
        // Solo se escribe lo que de verdad cambió. Sin esta comparación, guardar el producto
        // para corregirle el nombre convertía en propio un precio que venía heredado, y esa
        // sucursal dejaba de enterarse de los cambios generales sin que nadie lo pidiera.
        const cambio = (nuevo, vigente) => {
          if (nuevo === undefined) return false;
          if (nuevo === "" || nuevo === null) return vigente != null;   // vaciar = volver a heredar
          return Math.abs(parseFloat(nuevo) - parseFloat(vigente ?? NaN)) > 1e-9 || vigente == null;
        };
        // Un valor propio idéntico al general no es un valor propio: es el general escrito a
        // mano. Se guarda NULL para que la sucursal siga heredando; si no, quedaría anclada a
        // ese número y el próximo cambio general la dejaría atrás sin que nadie lo note.
        const valor = (v, general) => {
          if (v === "" || v === null) return null;
          const n = parseFloat(v);
          return Math.abs(n - parseFloat(general ?? NaN)) < 1e-9 ? null : n;
        };

        const cambios = {};
        if (cambio(price,      ficha?.price      ?? product.price))      cambios.price      = valor(price,      product.price);
        if (cambio(cost_price, ficha?.cost_price ?? product.cost_price)) cambios.cost_price = valor(cost_price, product.cost_price);
        if (cambio(min_stock,  ficha?.min_stock  ?? product.min_stock))  cambios.min_stock  = valor(min_stock,  product.min_stock);

        if (Object.keys(cambios).length) {
          if (ficha) {
            await ficha.update(cambios, { transaction: t });
          } else if (!isComboBool && !isServiceBool) {
            // La sucursal no manejaba este producto y le acaban de poner precio propio: pasa
            // a formar parte de su surtido, en cero hasta que entre mercancía. Combos y
            // servicios no llevan ficha de existencias.
            await ProductStock.create(
              { warehouse_id, product_id: product.id, qty: 0, company_id, ...cambios },
              { transaction: t }
            );
          }
        }
      }
    }

    if (isComboBool && combo_items !== undefined) {
      await ProductComboItem.destroy({ where: { combo_id: product.id }, transaction: t });
      const parsedItems = typeof combo_items === 'string' ? (combo_items ? JSON.parse(combo_items) : []) : combo_items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        await ProductComboItem.bulkCreate(
          parsedItems.map(i => ({ combo_id: product.id, product_id: i.product_id, quantity: i.quantity, company_id })),
          { transaction: t }
        );
      }
    } else if (!isComboBool) {
      await ProductComboItem.destroy({ where: { combo_id: product.id }, transaction: t });
    }

    // undefined = el guardado no tocó los beneficios (una edición rápida desde otra
    // pantalla); una lista vacía SÍ es una instrucción válida y los quita todos.
    if (benefit_tag_ids !== undefined) {
      await syncBenefitTags(product.id, benefit_tag_ids, company_id, t);
    }

    // Actualiza en cascada el precio de venta de los combos que contengan este producto
    await updateComboPricesForProduct(product.id, t);

    await t.commit();
    return { data: { ...product.toJSON(), image_url: imageUrl(currentImageValue) } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function deleteProduct(id, company_id) {
  const product = await Product.findOne({ where: { id, ...(company_id ? { company_id } : {}) } });
  if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

  const stockQty = await ProductStock.sum('qty', { where: { product_id: id } });
  if (parseFloat(stockQty || 0) > 0) {
    const e = new Error("No se puede eliminar: el producto tiene existencias en inventario"); e.status = 400; throw e;
  }

  const saleCount = await SaleItem.count({ where: { product_id: id } });
  if (saleCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de ventas asociadas"); e.status = 400; throw e;
  }

  const comboUsageCount = await ProductComboItem.count({ where: { product_id: id } });
  if (comboUsageCount > 0) {
    const e = new Error("No se puede eliminar: es parte de uno o más combos (ingrediente)"); e.status = 400; throw e;
  }

  const purchaseCount = await PurchaseItem.count({ where: { product_id: id } });
  if (purchaseCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de compras asociadas"); e.status = 400; throw e;
  }

  const transferCount = await StockTransfer.count({ where: { product_id: id } });
  if (transferCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de transferencias"); e.status = 400; throw e;
  }

  await handleImageDelete(product.image_filename);
  await ProductStock.destroy({ where: { product_id: id } });
  await product.destroy();
  return { message: "Producto eliminado exitosamente" };
}

// Publica u oculta varios productos de una sola vez. Marcar decenas de productos uno por
// uno desde el modal no es viable en un inventario real, y es justo lo que hace falta
// después de la migración, que deja todo oculto.
async function setCatalogVisibility({ ids, visible, company_id }) {
  const list = (Array.isArray(ids) ? ids : [])
    .map(n => parseInt(n, 10))
    .filter(n => Number.isInteger(n));

  if (list.length === 0) {
    const e = new Error("No se recibieron productos"); e.status = 400; throw e;
  }

  // Publicar en bloque no puede colar insumos al catálogo: al publicar solo se tocan los
  // vendibles. Despublicar sí vale para todos, que siempre es ir hacia el lado seguro.
  const [updated] = await Product.update(
    { visible_in_catalog: !!visible },
    { where: {
        id: { [Op.in]: list },
        ...(company_id ? { company_id } : {}),
        ...(visible ? { sellable: true } : {}),
    } }
  );

  return { data: { updated } };
}

async function calculateComboCost(comboId, t) {
  const items = await ProductComboItem.findAll({
    where: { combo_id: comboId },
    include: [{ model: Product, as: 'ingredient', attributes: ['cost_price', 'is_combo'] }],
    transaction: t
  });
  let totalCost = 0;
  for (const item of items) {
    if (!item.ingredient) continue;
    let c = 0;
    if (item.ingredient.is_combo) {
      c = await calculateComboCost(item.product_id, t);
    } else {
      c = parseFloat(item.ingredient.cost_price || 0);
    }
    totalCost += c * parseFloat(item.quantity);
  }
  return totalCost;
}

async function updateComboPricesForProduct(productId, t, visited = new Set()) {
  if (visited.has(productId)) return; // Previene bucles infinitos
  visited.add(productId);

  const comboItems = await ProductComboItem.findAll({ where: { product_id: productId }, transaction: t });
  const comboIds = [...new Set(comboItems.map(ci => ci.combo_id))];

  for (const comboId of comboIds) {
    const combo = await Product.findByPk(comboId, { transaction: t });
    if (!combo) continue;

    const totalCost = await calculateComboCost(comboId, t);

    // Solo se actualiza automáticamente si tiene un margen de ganancia configurado
    if (combo.profit_margin !== null && combo.profit_margin !== undefined) {
      const margin = parseFloat(combo.profit_margin) || 0;
      const newPrice = totalCost * (1 + margin / 100);
      const roundedPrice = parseFloat(newPrice.toFixed(2));
      
      if (parseFloat(combo.price) !== roundedPrice) {
         await combo.update({ price: roundedPrice }, { transaction: t });
         // Recursividad: actualiza combos que contengan a este combo
         await updateComboPricesForProduct(comboId, t, visited);
      }
    }
  }
}

// calculateComboStockAndCost se exporta para que el catálogo público calcule la
// disponibilidad de un combo con la misma regla que el POS, en vez de duplicarla.
module.exports = { getAll, getOne, createProduct, updateProduct, deleteProduct, setCatalogVisibility, calculateComboStockAndCost };
