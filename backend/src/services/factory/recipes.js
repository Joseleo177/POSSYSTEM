'use strict';

const {
  sequelize, Sequelize, Product, FabricationRecipe, FabricationRecipeItem, FabricationStage,
  fail, r3, r4, MAX_QTY, sizeOf, fmtLen, text, companyOf, employeeOf, ownWarehouse,
  unitCostOf, anyUnitCost, COST_ANY_SQL, inTransaction,
} = require("./shared");
const { evaluate, variablesIn, FormulaError } = require("./formula");
const { isIntegerUnit } = require("../../utils/units");

const QT = Sequelize.QueryTypes;

// Milímetros por unidad de la receta: las medidas de las fórmulas se escriben en m, cm o mm.
const UNIT_MM = { m: 1000, cm: 10, mm: 1 };
const RESERVED = new Set(["REDONDEAR", "TECHO", "PISO", "MIN", "MAX", "ABS", "ROUND", "CEIL", "FLOOR"]);
const MAX_MINUTES = 100000;

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// El producto que se fabrica: ni material por piezas, ni combo, ni servicio, ni modelo.
async function finishedProduct(productId, transaction) {
  const product = await Product.findByPk(parseInt(productId) || 0, { transaction });
  if (!product) throw fail("Producto no encontrado", 404);
  if (product.piece_mode || product.is_combo || product.is_service || product.is_variant_parent) {
    throw fail(`"${product.name}" no puede llevar receta de fabricación`);
  }
  return product;
}

// ── Variables de la receta ──────────────────────────────────────────────────────────────
//   { key: "L", label: "Largo", kind: "medida" | "numero", default: 1.8 }
// Una medida se escribe en la unidad de la receta; un número es un conteo (puertas, gavetas).
function parseParams(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw fail("Variables no válidas");
  if (raw.length > 10) throw fail("Una receta admite hasta 10 variables");
  const seen = new Set();
  return raw.map((p, i) => {
    const key = String(p?.key ?? "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,9}$/.test(key)) throw fail(`Variable ${i + 1}: el nombre corto va con letras y números, empezando por letra (L, A, ALTO)`);
    if (RESERVED.has(key)) throw fail(`Variable ${i + 1}: "${key}" es el nombre de una función`);
    if (seen.has(key)) throw fail(`La variable ${key} está repetida`);
    seen.add(key);
    const label = text(p.label, 40) || key;
    const kind = p.kind === "numero" ? "numero" : "medida";
    const def = parseFloat(String(p.default ?? "").replace(",", "."));
    if (!Number.isFinite(def) || def < 0 || def > 1e6) throw fail(`Variable ${key}: escribe un valor por defecto`);
    return { key, label, kind, default: def };
  });
}

// Valores de una orden: los que vengan, o el valor por defecto de cada variable.
function valuesFor(params, input = {}) {
  const vars = Object.create(null);
  for (const p of params) {
    const raw = input?.[p.key] ?? input?.[p.key.toLowerCase()];
    const v = raw == null || raw === "" ? p.default : parseFloat(String(raw).replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 1e6) throw fail(`${p.label}: el valor no es válido`);
    vars[p.key] = v;
  }
  return vars;
}

// ── Líneas ──────────────────────────────────────────────────────────────────────────────

const EXPR_FIELDS = ["width_expr", "length_expr", "cuts_expr", "quantity_expr", "minutes_expr"];

function cleanExpr(value) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 200) : null;
}

function checkExpr(expr, keys, label) {
  try {
    const unknown = variablesIn(expr).filter(v => !keys.has(v));
    if (unknown.length) throw new FormulaError(`usa ${unknown.join(", ")}, que no es una variable de la receta`);
  } catch (e) {
    if (e instanceof FormulaError) throw fail(`${label}: la fórmula ${e.message}`);
    throw e;
  }
}

// Valida una línea y la deja como se guarda. El tipo lo decide lo que trae: una etapa es un
// proceso; un material por piezas, cortes; cualquier otro producto, un accesorio.
async function parseLine(raw, i, product, keys, companyId, transaction) {
  const label = `Línea ${i + 1}`;
  if (!raw || typeof raw !== "object") throw fail(`${label}: no válida`);

  if (raw.stage_id) {
    const stage = await FabricationStage.findOne({ where: { id: parseInt(raw.stage_id) || 0, company_id: companyId }, transaction });
    if (!stage) throw fail(`${label}: etapa no encontrada`, 404);
    const minutes = cleanExpr(raw.minutes_expr);
    if (!minutes) throw fail(`${label}: escribe los minutos de ${stage.name}`);
    checkExpr(minutes, keys, `${label} (${stage.name}, minutos)`);
    return { kind: "proceso", stage_id: stage.id, component_id: null, minutes_expr: minutes, name: stage.name };
  }

  const component = await Product.findByPk(parseInt(raw.component_id) || 0, { transaction });
  if (!component) throw fail(`${label}: producto no encontrado`, 404);
  if (component.id === product.id) throw fail(`${label}: un producto no puede llevarse a sí mismo`);
  if (component.is_combo || component.is_service || component.is_variant_parent) {
    throw fail(`${label}: "${component.name}" no maneja existencia`);
  }

  if (component.piece_mode) {
    const out = { kind: "material", component_id: component.id, stage_id: null, name: component.name, unit: component.unit, piece_mode: component.piece_mode };
    out.length_expr = cleanExpr(raw.length_expr);
    out.cuts_expr = cleanExpr(raw.cuts_expr) || "1";
    if (!out.length_expr) throw fail(`${label}: escribe el largo del corte de ${component.name}`);
    checkExpr(out.length_expr, keys, `${label} (largo)`);
    checkExpr(out.cuts_expr, keys, `${label} (cortes)`);
    if (component.piece_mode === "area") {
      out.width_expr = cleanExpr(raw.width_expr);
      if (!out.width_expr) throw fail(`${label}: escribe el ancho del corte de ${component.name}`);
      checkExpr(out.width_expr, keys, `${label} (ancho)`);
    }
    return out;
  }

  const quantity = cleanExpr(raw.quantity_expr ?? raw.quantity);
  if (!quantity) throw fail(`${label}: escribe la cantidad de ${component.name}`);
  checkExpr(quantity, keys, `${label} (cantidad)`);
  return { kind: "accesorio", component_id: component.id, stage_id: null, quantity_expr: quantity, name: component.name, unit: component.unit };
}

/**
 * Calcula las líneas de una receta con unos valores: devuelve números por unidad, listos para
 * copiar en la orden. Los cortes se redondean hacia arriba (no existe medio corte) y lo que se
 * cuenta por unidades también.
 */
function computeLines(lines, unit, vars) {
  const f = UNIT_MM[unit] || 1000;
  return lines.map((l, i) => {
    const label = l.name || `Línea ${i + 1}`;
    const ev = (expr, what) => {
      try { return evaluate(expr, vars); }
      catch (e) {
        if (e instanceof FormulaError) throw fail(`${label}, ${what}: la fórmula ${e.message}`);
        throw e;
      }
    };
    if (l.kind === "proceso") {
      const minutes = r2(ev(l.minutes_expr, "minutos"));
      if (minutes < 0 || minutes > MAX_MINUTES) throw fail(`${label}: da ${minutes} minutos, fuera de rango`);
      return { ...l, minutes };
    }
    if (l.kind === "material") {
      const mmOf = (expr, what) => {
        const v = Math.round(ev(expr, what) * f);
        if (!(v > 0) || v > 20000) throw fail(`${label}: el ${what} da ${fmtLen(v, unit)}, fuera de rango`);
        return v;
      };
      const cut_length_mm = mmOf(l.length_expr, "largo");
      const cut_width_mm = l.width_expr ? mmOf(l.width_expr, "ancho") : null;
      const cuts = Math.ceil(ev(l.cuts_expr, "cortes") - 1e-9);
      if (!(cuts >= 1) || cuts > 1000) throw fail(`${label}: da ${cuts} cortes, fuera de rango`);
      return { ...l, cut_width_mm, cut_length_mm, cuts };
    }
    let quantity = ev(l.quantity_expr, "cantidad");
    quantity = isIntegerUnit(l.unit) ? Math.ceil(quantity - 1e-9) : r3(quantity);
    if (!(quantity > 0) || quantity > MAX_QTY) throw fail(`${label}: la cantidad da ${quantity}, fuera de rango`);
    return { ...l, quantity };
  });
}

/**
 * Lo que piden unas líneas ya calculadas (por unidad) para `quantity` unidades, con su costo
 * al día: material al costo por m² o por metro de la sucursal, accesorios a su costo, y
 * procesos a la tarifa por hora de su etapa. Es una estimación: el consumo real incluye el
 * desperdicio del corte y el tiempo real del taller.
 */
async function estimate(lines, quantity, warehouseId, transaction) {
  const qty = parseFloat(quantity) || 0;
  const out = [];
  let total = 0;
  for (const l of lines) {
    if (l.kind === "proceso") {
      const stage = await FabricationStage.findByPk(l.stage_id, { attributes: ["name", "cost_per_hour"], transaction });
      const rate = parseFloat(stage?.cost_per_hour || 0);
      const expected = r2(parseFloat(l.minutes) * qty);
      const lineCost = r4((expected / 60) * rate);
      total += lineCost;
      out.push({ ...l, name: stage?.name || l.name, expected, unit_cost: r4(rate), cost: lineCost });
      continue;
    }
    const cost = warehouseId
      ? await unitCostOf(l.component_id, warehouseId, transaction)
      : await anyUnitCost(l.component_id, transaction);
    if (l.kind === "material") {
      const mode = l.piece_mode || (l.cut_width_mm ? "area" : "length");
      const cutSize = sizeOf(mode, l.cut_width_mm, l.cut_length_mm);
      const expected = r3(cutSize * l.cuts * qty);
      const lineCost = r4(expected * cost);
      total += lineCost;
      out.push({ ...l, piece_mode: mode, cut_size: cutSize, total_cuts: l.cuts * qty, expected, unit_cost: r4(cost), cost: lineCost });
    } else {
      const expected = r3(parseFloat(l.quantity) * qty);
      const lineCost = r4(expected * cost);
      total += lineCost;
      out.push({ ...l, expected, unit_cost: r4(cost), cost: lineCost });
    }
  }
  return { lines: out, total_cost: r4(total), unit_cost: qty > 0 ? r4(total / qty) : 0 };
}

async function readRecipe(company, productId, transaction) {
  const recipe = await FabricationRecipe.findOne({ where: { company_id: company, product_id: productId }, transaction });
  if (!recipe) return null;
  const items = await sequelize.query(`
    SELECT ri.id, ri.kind, ri.component_id, ri.stage_id, ri.width_expr, ri.length_expr, ri.cuts_expr,
           ri.quantity_expr, ri.minutes_expr, ri.position,
           COALESCE(p.name, s.name) AS name, p.unit, p.piece_mode,
           ${COST_ANY_SQL("p")}::float AS cost_price, s.cost_per_hour::float AS cost_per_hour
      FROM fabrication_recipe_items ri
      LEFT JOIN products p ON p.id = ri.component_id
      LEFT JOIN fabrication_stages s ON s.id = ri.stage_id
     WHERE ri.recipe_id = :id
     ORDER BY ri.position, ri.id`, { replacements: { id: recipe.id }, type: QT.SELECT, transaction });
  const product = await Product.findByPk(recipe.product_id, { attributes: ["name", "unit"], transaction });
  return {
    id: recipe.id, product_id: recipe.product_id, product_name: product?.name ?? null, product_unit: product?.unit ?? null,
    unit: recipe.unit, params: recipe.params || [], instructions: recipe.instructions, updated_at: recipe.updated_at, items,
  };
}

// La receta calculada con unos valores y una cantidad, con su costo. La usan la orden nueva,
// el editor de recetas (con un borrador sin guardar) y la creación de la orden.
async function computeRecipe(recipe, { values, quantity, warehouseId }, transaction) {
  const vars = valuesFor(recipe.params || [], values);
  const lines = computeLines(recipe.items, recipe.unit, vars);
  const qty = Math.min(Math.max(r3(quantity) || 1, 0.001), MAX_QTY);
  const est = await estimate(lines, qty, warehouseId, transaction);
  const params = (recipe.params || []).map(p => ({ ...p, value: vars[p.key], unit: p.kind === "medida" ? recipe.unit : null }));
  return { quantity: qty, params, ...est };
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────────

async function listRecipes(req) {
  const company = companyOf(req);
  const rows = await sequelize.query(`
    SELECT r.id, r.product_id, r.updated_at, r.params, p.name AS product_name, p.unit,
           COUNT(ri.id) FILTER (WHERE ri.kind = 'material')::int  AS materials,
           COUNT(ri.id) FILTER (WHERE ri.kind = 'accesorio')::int AS accessories,
           COUNT(ri.id) FILTER (WHERE ri.kind = 'proceso')::int   AS processes,
           COALESCE(string_agg(DISTINCT c.name, ', ') FILTER (WHERE ri.kind = 'material'), '') AS material_names
      FROM fabrication_recipes r
      JOIN products p ON p.id = r.product_id
      LEFT JOIN fabrication_recipe_items ri ON ri.recipe_id = r.id
      LEFT JOIN products c ON c.id = ri.component_id
     WHERE r.company_id = :company
     GROUP BY r.id, p.name, p.unit
     ORDER BY p.name`, { replacements: { company }, type: QT.SELECT });
  return { data: rows };
}

async function getRecipe(req, productId) {
  const company = companyOf(req);
  const recipe = await readRecipe(company, parseInt(productId) || 0);
  if (!recipe) throw fail("Ese producto no tiene receta", 404);
  return { data: recipe };
}

function parseValues(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

async function previewRecipe(req, productId, { quantity, warehouse_id, params } = {}) {
  const company = companyOf(req);
  const recipe = await readRecipe(company, parseInt(productId) || 0);
  if (!recipe) return { data: null };
  const wid = warehouse_id ? await ownWarehouse(req, warehouse_id) : null;
  const out = await computeRecipe(recipe, { values: parseValues(params), quantity, warehouseId: wid });
  return { data: { ...recipe, ...out } };
}

// Valida y normaliza el cuerpo de una receta (para guardarla o para probar un borrador).
async function parseRecipeBody(company, product, body, transaction) {
  if (!Array.isArray(body.items) || !body.items.length) throw fail("La receta lleva al menos un corte, accesorio o proceso");
  if (body.items.length > 60) throw fail("Son demasiadas líneas para una receta");
  const unit = UNIT_MM[body.unit] ? body.unit : "m";
  const params = parseParams(body.params);
  const keys = new Set(params.map(p => p.key));
  const lines = [];
  for (let i = 0; i < body.items.length; i++) {
    lines.push(await parseLine(body.items[i], i, product, keys, company, transaction));
  }
  return { unit, params, lines };
}

// Prueba un borrador del editor sin guardarlo: cómo queda con los valores por defecto.
async function evaluateDraft(req, body = {}) {
  const company = companyOf(req);
  const product = body.product_id ? await finishedProduct(body.product_id) : { id: 0 };
  const { unit, params, lines } = await parseRecipeBody(company, product, body);
  const wid = body.warehouse_id ? await ownWarehouse(req, body.warehouse_id) : null;
  const out = await computeRecipe({ unit, params, items: lines }, { values: body.values, quantity: body.quantity || 1, warehouseId: wid });
  return { data: out };
}

async function saveRecipe(req, productId, body = {}) {
  const company = companyOf(req);
  return inTransaction(async (transaction) => {
    const product = await finishedProduct(productId, transaction);
    const { unit, params, lines } = await parseRecipeBody(company, product, body, transaction);

    // Que funcione con los valores por defecto: una fórmula que da un corte negativo o cero
    // cortes se detecta al guardar, no al crear la primera orden.
    computeLines(lines, unit, valuesFor(params, {}));

    await writeRecipe(company, product, { unit, params, lines }, text(body.instructions, 4000), employeeOf(req), transaction);
    return { data: await readRecipe(company, product.id, transaction) };
  });
}

// Guarda (o reemplaza) la receta de un producto con líneas ya validadas por parseRecipeBody.
// También la usa la orden que, hecha a mano, se guarda como receta del producto.
async function writeRecipe(company, product, { unit, params, lines }, instructions, employeeId, transaction) {
  let recipe = await FabricationRecipe.findOne({ where: { company_id: company, product_id: product.id }, transaction, lock: true });
  if (recipe) {
    await recipe.update({ unit, params, instructions, employee_id: employeeId }, { transaction });
    await FabricationRecipeItem.destroy({ where: { recipe_id: recipe.id }, transaction });
  } else {
    recipe = await FabricationRecipe.create({
      company_id: company, product_id: product.id, unit, params, instructions, employee_id: employeeId,
    }, { transaction });
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const row = { company_id: company, recipe_id: recipe.id, kind: l.kind, component_id: l.component_id, stage_id: l.stage_id, position: i };
    for (const k of EXPR_FIELDS) row[k] = l[k] ?? null;
    await FabricationRecipeItem.create(row, { transaction });
  }
  return recipe;
}

async function deleteRecipe(req, productId) {
  const company = companyOf(req);
  return inTransaction(async (transaction) => {
    const recipe = await FabricationRecipe.findOne({ where: { company_id: company, product_id: parseInt(productId) || 0 }, transaction, lock: true });
    if (!recipe) throw fail("Ese producto no tiene receta", 404);
    // Las órdenes ya creadas conservan su copia (fabrication_order_plan): borrar no las toca.
    await FabricationRecipeItem.destroy({ where: { recipe_id: recipe.id }, transaction });
    await recipe.destroy({ transaction });
    return { ok: true };
  });
}

module.exports = {
  listRecipes, getRecipe, previewRecipe, evaluateDraft, saveRecipe, deleteRecipe,
  readRecipe, computeRecipe, estimate, parseRecipeBody, writeRecipe,
};
