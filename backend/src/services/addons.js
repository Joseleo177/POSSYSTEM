const { ModifierGroup, ModifierOption, ProductModifierGroup, Product, ProductStock, ProductComboItem, sequelize, Sequelize } = require("../models");
const { isIntegerUnit } = require("../utils/units");
const { vendeSinInsumo } = require("./products/recipeStock");

const { Op } = Sequelize;

// Adicionales de los platos (ver migración 20261031130000-adicionales).
//
// Aquí vive la configuración (grupos, opciones y a qué platos van) y `resolver`, que es lo
// único que usan los caminos de venta: convierte las opciones elegidas en
//   - texto para la cocina y la nota de la línea ("Término medio · Sin cebolla"), y
//   - líneas aparte para lo que cuesta ("+ Queso extra"), que son productos normales.
// Así el precio, el inventario y la factura de un adicional pasan por donde ya pasan todos.
//
// Lo que gasta una opción ("Papas fritas" = 150 g de papa; "Arepitas" = 3 unidades) es la
// receta de su producto, que entonces es un combo: el descuento, la anulación, la devolución,
// el kardex y el costo ya saben de combos. Una opción sin precio que gasta inventario también
// va como línea, a 0: es la única forma de que su consumo quede en un documento.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const limpio = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

// "Elige 1 · obligatorio", "Opcional · hasta 3": cómo se lee la regla del grupo.
const regla = (g) => {
  const max = g.max_select;
  if (g.min_select > 0) return max === 1 ? "Elige 1" : max ? `Elige de ${g.min_select} a ${max}` : `Elige al menos ${g.min_select}`;
  return max === 1 ? "Opcional · 1" : max ? `Opcional · hasta ${max}` : "Opcional";
};

// Receta de cada adicional combo: ingrediente, unidad y cantidad por plato.
async function recetasDe(comboIds, transaction) {
  const ids = [...new Set(comboIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const filas = await ProductComboItem.findAll({
    where: { combo_id: { [Op.in]: ids } },
    include: [{ model: Product, as: "ingredient", attributes: ["id", "name", "unit"] }],
    order: [["id", "ASC"]],
    transaction,
  });
  const m = new Map();
  for (const f of filas) {
    if (!f.ingredient) continue;
    if (!m.has(f.combo_id)) m.set(f.combo_id, []);
    m.get(f.combo_id).push({ product_id: f.product_id, name: f.ingredient.name, unit: f.ingredient.unit, quantity: parseFloat(f.quantity) });
  }
  return m;
}

/**
 * Lo que gasta una opción, tal como llega del editor: [{ product_id, quantity }], la cantidad
 * en la unidad del ingrediente (150 g de papa = 0,150 KG). Las unidades contables van enteras:
 * no se descuenta media arepa. undefined = el editor no la mandó y no se toca.
 */
async function leerConsumo(nombre, consume, transaction) {
  if (consume === undefined || consume === null) return undefined;
  if (!Array.isArray(consume)) throw fail(`${nombre}: consumo no válido`);
  if (consume.length > 10) throw fail(`${nombre}: hasta 10 ingredientes por opción`);
  const filas = consume.map(c => ({ product_id: int(c.product_id), quantity: Math.round((parseFloat(c.quantity) || 0) * 1000) / 1000 }));
  const ids = [...new Set(filas.map(f => f.product_id))];
  if (ids.some(id => !Number.isInteger(id))) throw fail(`${nombre}: ingrediente no válido`);
  if (ids.length !== filas.length) throw fail(`${nombre}: un ingrediente está repetido`);
  if (!ids.length) return [];
  const prods = await Product.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name", "unit", "is_combo", "is_service", "is_addon", "is_variant_parent"], transaction });
  const porId = new Map(prods.map(p => [p.id, p]));
  for (const f of filas) {
    const p = porId.get(f.product_id);
    if (!p) throw fail(`${nombre}: uno de los ingredientes ya no existe`);
    if (p.is_combo || p.is_service || p.is_addon || p.is_variant_parent) {
      throw fail(`${nombre}: "${p.name}" no lleva existencia propia; elige el insumo que se gasta`);
    }
    if (!(f.quantity > 0) || f.quantity > 9999) throw fail(`${nombre}: cantidad no válida de "${p.name}"`);
    if (isIntegerUnit(p.unit) && !Number.isInteger(f.quantity)) {
      throw fail(`${nombre}: "${p.name}" se cuenta por unidades enteras`);
    }
  }
  return filas;
}

/** Grupos de la empresa, con sus opciones (y el precio del adicional) y los platos que los usan. */
async function listGroups() {
  const grupos = await ModifierGroup.findAll({
    where: { active: true },
    include: [{
      model: ModifierOption, as: "options", where: { active: true }, required: false,
      include: [{ model: Product, as: "product", attributes: ["id", "name", "price", "is_service", "is_combo"] }],
    }],
    order: [["sort_order", "ASC"], ["id", "ASC"], [{ model: ModifierOption, as: "options" }, "sort_order", "ASC"]],
  });
  const recetas = await recetasDe(grupos.flatMap(g => g.options.filter(o => o.product?.is_combo).map(o => o.product_id)));
  const usos = await ProductModifierGroup.findAll({
    where: { group_id: { [Op.in]: grupos.map(g => g.id) } },
    include: [],
    attributes: ["group_id", "product_id"],
  });
  const ids = [...new Set(usos.map(u => u.product_id))];
  const nombres = new Map((ids.length ? await Product.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"] }) : []).map(p => [p.id, p.name]));

  return {
    data: grupos.map(g => ({
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      rule: regla(g),
      options: g.options.map(o => ({
        id: o.id,
        name: o.name,
        product_id: o.product_id,
        price: o.product ? round2(o.product.price) : 0,
        sold_out: !!o.sold_out,
        // Lo que gasta del inventario por plato. own_stock: el adicional tiene existencia
        // propia (se le dio desde Catálogo) y se descuenta él mismo.
        consume: o.product?.is_combo ? (recetas.get(o.product_id) || []) : [],
        own_stock: !!o.product && !o.product.is_service && !o.product.is_combo,
      })),
      products: usos.filter(u => u.group_id === g.id).map(u => ({ id: u.product_id, name: nombres.get(u.product_id) })).filter(p => p.name),
    })),
  };
}

/**
 * Crea o edita un grupo entero: nombre, regla, opciones y platos.
 * body: { id?, name, min_select, max_select, options: [{ id?, name, price }], product_ids: [] }
 *
 * Una opción con precio necesita un producto: si no lo tiene se crea (servicio, oculto de los
 * menús); si ya lo tiene, se le actualiza nombre y precio. Quitarle el precio la deja como
 * texto, sin borrar el producto: las ventas que ya lo usaron lo siguen nombrando.
 */
async function saveGroup(req, body = {}) {
  const name = limpio(body.name, 60);
  if (!name) throw fail("Ponle nombre al grupo");
  const min = Math.max(0, int(body.min_select) || 0);
  const max = body.max_select === null || body.max_select === "" || body.max_select === undefined ? null : int(body.max_select);
  if (max !== null && !(max >= 1 && max <= 20)) throw fail("El máximo va de 1 a 20, o sin límite");
  if (min > 20) throw fail("El mínimo va de 0 a 20");
  if (max !== null && min > max) throw fail("El mínimo no puede ser mayor que el máximo");

  const opciones = (Array.isArray(body.options) ? body.options : []).map((o, i) => {
    const n = limpio(o.name, 60);
    if (!n) throw fail(`A la opción ${i + 1} le falta el nombre`);
    const price = round2(o.price);
    if (price < 0 || price > 100000) throw fail(`${n}: precio no válido`);
    return { id: o.id ? int(o.id) : null, name: n, price, consume: o.consume };
  });
  if (!opciones.length) throw fail("El grupo necesita al menos una opción");
  if (opciones.length > 40) throw fail("Un grupo admite hasta 40 opciones");
  const vistos = new Set();
  for (const o of opciones) {
    const k = o.name.toLowerCase();
    if (vistos.has(k)) throw fail(`La opción "${o.name}" está repetida`);
    vistos.add(k);
  }
  if (min > opciones.length) throw fail("El grupo pide elegir más opciones de las que tiene");

  const productIds = [...new Set((Array.isArray(body.product_ids) ? body.product_ids : []).map(int).filter(Number.isInteger))];

  return sequelize.transaction(async (transaction) => {
    let grupo;
    if (body.id) {
      grupo = await ModifierGroup.findOne({ where: { id: int(body.id), active: true }, transaction });
      if (!grupo) throw fail("Grupo no encontrado", 404);
      await grupo.update({ name, min_select: min, max_select: max }, { transaction });
    } else {
      const ultimo = await ModifierGroup.max("sort_order", { where: { active: true }, transaction });
      grupo = await ModifierGroup.create({ name, min_select: min, max_select: max, sort_order: (ultimo ?? -1) + 1, company_id: req.company_id }, { transaction });
    }

    const actuales = await ModifierOption.findAll({ where: { group_id: grupo.id, active: true }, transaction });
    const porId = new Map(actuales.map(o => [o.id, o]));
    for (const o of opciones) {
      if (o.id && !porId.has(o.id)) throw fail(`La opción "${o.name}" ya no existe. Recarga el grupo.`);
    }
    const quedan = new Set(opciones.filter(o => o.id).map(o => o.id));
    const quitar = actuales.filter(o => !quedan.has(o.id)).map(o => o.id);
    if (quitar.length) await ModifierOption.update({ active: false }, { where: { id: { [Op.in]: quitar } }, transaction });

    for (const [i, o] of opciones.entries()) {
      const previa = o.id ? porId.get(o.id) : null;
      let productId = previa?.product_id ?? null;
      const consumo = await leerConsumo(o.name, o.consume, transaction);
      const actual = productId ? await Product.findByPk(productId, { attributes: ["id", "is_service", "is_combo"], transaction }) : null;
      // Un adicional con existencia propia (se le dio desde Catálogo) se sigue descontando solo.
      const propia = !!actual && !actual.is_service && !actual.is_combo;
      const gasta = consumo === undefined ? !!actual?.is_combo : consumo.length > 0;
      if (o.price > 0 || gasta || (propia && consumo === undefined)) {
        // Con receta es combo; sin ella, servicio. Lo de existencia propia no se toca.
        const tipo = consumo === undefined || propia ? {} : { is_combo: gasta, is_service: !gasta };
        if (actual) {
          await Product.update({ name: o.name, price: o.price, ...tipo }, { where: { id: productId }, transaction });
        } else {
          const p = await Product.create({
            name: o.name, price: o.price, cost_price: 0, is_service: !gasta, is_combo: gasta, sellable: true,
            is_addon: true, visible_in_catalog: false, company_id: req.company_id,
          }, { transaction });
          productId = p.id;
        }
        // La receta se reemplaza entera cuando el editor la manda.
        if (consumo !== undefined && !propia) {
          await ProductComboItem.destroy({ where: { combo_id: productId }, transaction });
          if (consumo.length) {
            await ProductComboItem.bulkCreate(
              consumo.map(c => ({ combo_id: productId, product_id: c.product_id, quantity: c.quantity, company_id: req.company_id })),
              { transaction },
            );
          }
        }
      } else {
        productId = null;
      }
      if (previa) await previa.update({ name: o.name, product_id: productId, sort_order: i }, { transaction });
      else await ModifierOption.create({ group_id: grupo.id, name: o.name, product_id: productId, sort_order: i, company_id: req.company_id }, { transaction });
    }

    // Platos que usan el grupo: se reemplaza la lista entera.
    if (productIds.length) {
      const validos = await Product.count({ where: { id: { [Op.in]: productIds }, sellable: true, is_addon: false }, transaction });
      if (validos !== productIds.length) throw fail("Uno de los platos ya no está a la venta");
    }
    await ProductModifierGroup.destroy({ where: { group_id: grupo.id }, transaction });
    if (productIds.length) {
      await ProductModifierGroup.bulkCreate(
        productIds.map(pid => ({ product_id: pid, group_id: grupo.id, company_id: req.company_id, sort_order: grupo.sort_order })),
        { transaction },
      );
    }
    return { data: { id: grupo.id } };
  });
}

async function deleteGroup(req, id) {
  const grupo = await ModifierGroup.findOne({ where: { id: int(id), active: true } });
  if (!grupo) throw fail("Grupo no encontrado", 404);
  await sequelize.transaction(async (transaction) => {
    await ProductModifierGroup.destroy({ where: { group_id: grupo.id }, transaction });
    await grupo.update({ active: false }, { transaction });
  });
  return { data: { id: grupo.id } };
}

// Precio de cada producto en la sucursal (la ficha manda sobre el precio del catálogo).
async function preciosEn(productIds, warehouseId, transaction) {
  if (!productIds.length) return new Map();
  const productos = await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ["id", "name", "price", "is_service", "is_combo", "sellable"], transaction });
  const fichas = warehouseId
    ? await ProductStock.findAll({ where: { warehouse_id: warehouseId, product_id: { [Op.in]: productIds } }, attributes: ["product_id", "price", "qty"], transaction })
    : [];
  const ficha = new Map(fichas.map(f => [f.product_id, f]));

  // Un adicional combo ("Queso extra" = 50 g de queso) se agota cuando ya no alcanzan sus
  // ingredientes en la sucursal. Los ingredientes servicio no limitan. Sin sucursal no se
  // puede saber y se da por disponible: el servidor lo vuelve a revisar al vender.
  const alcance = new Map();
  const combos = productos.filter(p => p.is_combo).map(p => p.id);
  // Restaurante que vende aunque falte el insumo: el adicional no se agota solo (ver
  // products/recipeStock.js); queda el agotado manual.
  if (combos.length && warehouseId && !(await vendeSinInsumo(warehouseId, transaction))) {
    const filas = await sequelize.query(`
      SELECT ci.combo_id, ci.quantity, i.is_service, COALESCE(ps.qty, 0) AS qty
        FROM product_combo_items ci
        JOIN products i ON i.id = ci.product_id
        LEFT JOIN product_stock ps ON ps.product_id = ci.product_id AND ps.warehouse_id = :wid
       WHERE ci.combo_id IN (:ids)`,
      { replacements: { ids: combos, wid: warehouseId }, type: Sequelize.QueryTypes.SELECT, transaction });
    for (const f of filas) {
      if (f.is_service) continue;
      const n = Math.floor(parseFloat(f.qty) / (parseFloat(f.quantity) || 1));
      alcance.set(f.combo_id, Math.min(alcance.has(f.combo_id) ? alcance.get(f.combo_id) : Infinity, n));
    }
  }

  return new Map(productos.map(p => {
    const qty = p.is_service ? null
      : p.is_combo ? (alcance.has(p.id) ? alcance.get(p.id) : null)
      : parseFloat(ficha.get(p.id)?.qty || 0);
    return [p.id, {
      id: p.id, name: p.name, sellable: p.sellable,
      is_service: p.is_service, is_combo: p.is_combo,
      price: round2(ficha.get(p.id)?.price ?? p.price),
      // Existencia del adicional en la sucursal (null = sin límite: servicio, o combo de
      // servicios). La caja la usa para no dejar pasar más de lo que hay.
      stock: qty,
      agotado: qty !== null && qty <= 0,
    }];
  }));
}

/**
 * Una opción tal como la ve quien pide. Agotada si se marcó a mano o si su producto ya no tiene
 * con qué. `interno` (caja y mesonero) agrega el producto del adicional y su existencia, que la
 * caja necesita para armar la línea; el catálogo público nunca ve existencias.
 */
function opcionVisible(o, p, interno) {
  const base = { id: o.id, name: o.name, price: p ? p.price : 0, agotado: !!o.sold_out || !!p?.agotado };
  if (!interno) return base;
  return { ...base, product_id: o.product_id || null, stock: p ? p.stock : null, is_service: p ? !!p.is_service : null, is_combo: p ? !!p.is_combo : null };
}

/**
 * Marca o desmarca una opción como agotada (cocina o catálogo). Vale para todas las opciones
 * de la empresa con el mismo nombre: si se acabaron los tostones, se acabaron en "Contorno" y
 * en "Dos contornos", no en uno solo.
 */
async function setSoldOut(req, optionId, soldOut) {
  const o = await ModifierOption.findOne({ where: { id: int(optionId), active: true } });
  if (!o) throw fail("Opción no encontrada", 404);
  const [n] = await ModifierOption.update(
    { sold_out: !!soldOut },
    { where: { active: true, [Op.and]: [Sequelize.where(Sequelize.fn("lower", Sequelize.col("name")), o.name.toLowerCase())] } },
  );
  return { data: { id: o.id, name: o.name, sold_out: !!soldOut, affected: n } };
}

// Grupos activos de los platos, con sus opciones activas, en el orden en que se ofrecen.
async function gruposDe(productIds, transaction) {
  if (!productIds.length) return new Map();
  const usos = await ProductModifierGroup.findAll({
    where: { product_id: { [Op.in]: productIds } }, order: [["sort_order", "ASC"], ["group_id", "ASC"]], transaction,
  });
  if (!usos.length) return new Map();
  const grupos = await ModifierGroup.findAll({
    where: { id: { [Op.in]: [...new Set(usos.map(u => u.group_id))] }, active: true },
    include: [{ model: ModifierOption, as: "options", where: { active: true }, required: false }],
    order: [[{ model: ModifierOption, as: "options" }, "sort_order", "ASC"]],
    transaction,
  });
  const porId = new Map(grupos.map(g => [g.id, g]));
  const m = new Map();
  for (const u of usos) {
    const g = porId.get(u.group_id);
    if (!g) continue;
    if (!m.has(u.product_id)) m.set(u.product_id, []);
    m.get(u.product_id).push(g);
  }
  return m;
}

/**
 * Lo que la ficha del plato ofrece: sus grupos y opciones, con el precio de la sucursal.
 * Para el mesonero, la caja y el catálogo público.
 */
// `interno`: caja y mesonero (con producto y existencia del extra). El catálogo público pasa false.
async function forProduct(productId, warehouseId, interno = true) {
  const grupos = (await gruposDe([int(productId)])).get(int(productId)) || [];
  const precios = await preciosEn([...new Set(grupos.flatMap(g => g.options.map(o => o.product_id)).filter(Boolean))], warehouseId);
  return grupos.map(g => ({
    id: g.id,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
    rule: regla(g),
    options: g.options.map(o => {
      const p = o.product_id ? precios.get(o.product_id) : null;
      return opcionVisible(o, p, interno);
    }),
  }));
}

/**
 * Lo mismo que forProduct para una página entera de productos (catálogo público), en tres
 * consultas y no una por producto. Map id → grupos; los platos sin adicionales no aparecen.
 */
async function paraVarios(productIds, warehouseId) {
  const ids = [...new Set(productIds.map(int).filter(Number.isInteger))];
  const porPlato = await gruposDe(ids);
  if (!porPlato.size) return new Map();
  const precios = await preciosEn(
    [...new Set([...porPlato.values()].flat().flatMap(g => g.options.map(o => o.product_id)).filter(Boolean))], warehouseId,
  );
  const m = new Map();
  for (const [pid, grupos] of porPlato) {
    m.set(pid, grupos.map(g => ({
      id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, rule: regla(g),
      options: g.options.map(o => {
        const p = o.product_id ? precios.get(o.product_id) : null;
        return opcionVisible(o, p, false);
      }),
    })));
  }
  return m;
}

/** Qué platos tienen adicionales (para que el menú abra la ficha en vez de sumar directo). */
async function conAdicionales(productIds) {
  if (!productIds.length) return new Set();
  const rows = await sequelize.query(`
    SELECT DISTINCT pmg.product_id
      FROM product_modifier_groups pmg
      JOIN modifier_groups g ON g.id = pmg.group_id AND g.active
     WHERE pmg.product_id IN (:ids)`, { replacements: { ids: productIds }, type: Sequelize.QueryTypes.SELECT });
  return new Set(rows.map(r => r.product_id));
}

/**
 * Valida lo que se eligió para UN plato y lo traduce. Lanza 400 si falta algo obligatorio, si
 * se pasó del tope o si una opción no es de este plato.
 *
 * @returns {{ texto: string|null, cocina: string|null, extras: Array<{ product_id, name, price, incluido }> }}
 *   texto  → nota de la línea del plato ("Término medio · Papas fritas")
 *   cocina → lo que lee la cocina, extras incluidos ("Término medio · Papas fritas · + Queso extra")
 *   extras → líneas aparte, una por unidad del plato. `incluido`: sin precio; va a 0 solo para
 *            descontar lo que gasta (el contorno que viene con el plato).
 */
async function resolver(productId, optionIds, { warehouseId, nombrePlato = "el plato", transaction } = {}) {
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : []).map(int).filter(Number.isInteger))];
  const grupos = (await gruposDe([int(productId)], transaction)).get(int(productId)) || [];
  if (!grupos.length) {
    if (ids.length) throw fail(`${nombrePlato} no lleva adicionales`);
    return { texto: null, cocina: null, extras: [] };
  }

  const opcionDe = new Map();
  for (const g of grupos) for (const o of g.options) opcionDe.set(o.id, { o, g });
  for (const id of ids) if (!opcionDe.has(id)) throw fail(`Una de las opciones de ${nombrePlato} ya no está disponible`);

  const precios = await preciosEn([...new Set(ids.map(id => opcionDe.get(id).o.product_id).filter(Boolean))], warehouseId, transaction);
  const textos = [];
  const cocina = [];
  const extras = [];
  for (const g of grupos) {
    const elegidas = g.options.filter(o => ids.includes(o.id));
    if (elegidas.length < g.min_select) {
      throw fail(g.min_select === 1 ? `Elige ${g.name.toLowerCase()} para ${nombrePlato}` : `${nombrePlato}: elige al menos ${g.min_select} en ${g.name}`);
    }
    if (g.max_select !== null && elegidas.length > g.max_select) {
      throw fail(`${nombrePlato}: en ${g.name} se pueden elegir hasta ${g.max_select}`);
    }
    for (const o of elegidas) {
      if (o.sold_out) throw fail(`${o.name} está agotado`);
      if (o.product_id) {
        const p = precios.get(o.product_id);
        if (!p || !p.sellable) throw fail(`${o.name} ya no está a la venta`);
        if (p.agotado) throw fail(`${o.name} está agotado`);
        const incluido = !(p.price > 0);
        extras.push({ product_id: o.product_id, name: o.name, price: p.price, incluido });
        if (incluido) textos.push(o.name);
        cocina.push(incluido ? o.name : `+ ${o.name}`);
      } else {
        textos.push(o.name);
        cocina.push(o.name);
      }
    }
  }
  return {
    texto: textos.length ? textos.join(" · ") : null,
    cocina: cocina.length ? cocina.join(" · ").slice(0, 400) : null,
    extras,
  };
}

module.exports = { listGroups, saveGroup, deleteGroup, setSoldOut, forProduct, paraVarios, conAdicionales, resolver };
