// IVA del catálogo en lote. Una empresa que empieza a facturar con IVA tiene cientos de
// productos en 16 % (el valor por defecto) y necesita marcar de una vez los exentos —la cesta
// básica, las medicinas— o los de otra alícuota, sin abrir la ficha de cada uno.
//
// Solo cambia cómo se desglosará la factura de aquí en adelante: lo ya vendido conserva la
// alícuota con que se vendió (sale_items.iva_rate), así que el Libro de ventas no se mueve.
const { Op, fn, col } = require("sequelize");
const { Product } = require("../../models");
const { ivaActivo } = require("./iva");

const TIPOS = ["G", "R", "A", "E"];
const bad = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Qué productos toca: los marcados en el catálogo (con sus variantes, que heredan la alícuota
// del modelo), los de una categoría (las variantes heredan también la categoría) o todos.
function alcance({ company_id, ids, category_id, todos }) {
  if (!company_id) throw bad("Empresa no indicada");
  const where = { company_id };
  if (Array.isArray(ids) && ids.length) {
    const lista = [...new Set(ids.map(n => parseInt(n, 10)).filter(Number.isInteger))];
    if (!lista.length) throw bad("No se recibieron productos");
    where[Op.or] = [{ id: { [Op.in]: lista } }, { parent_id: { [Op.in]: lista } }];
  } else if (category_id) {
    const cat = parseInt(category_id, 10);
    if (!Number.isInteger(cat)) throw bad("Categoría no válida");
    where.category_id = cat;
  } else if (!todos) {
    throw bad("Indica a qué productos se aplica");
  }
  return where;
}

// Cuántos productos hay en cada alícuota dentro del alcance. Cuenta modelos y productos
// sueltos; las variantes van aparte para que el número coincida con lo que se ve en el catálogo.
async function resumen(params) {
  const where = alcance(params);
  const filas = await Product.findAll({
    where: { ...where, parent_id: null },
    attributes: ["iva_tipo", [fn("COUNT", col("id")), "n"]],
    group: ["iva_tipo"],
    raw: true,
  });
  const por_tipo = Object.fromEntries(TIPOS.map(t => [t, 0]));
  for (const f of filas) por_tipo[f.iva_tipo] = parseInt(f.n, 10) || 0;
  const variantes = await Product.count({ where: { ...where, parent_id: { [Op.ne]: null } } });
  const total = Object.values(por_tipo).reduce((a, b) => a + b, 0);
  return { data: { total, por_tipo, variantes } };
}

async function aplicar({ tipo, ...params }) {
  if (!TIPOS.includes(tipo)) throw bad("Alícuota no válida");
  if (!(await ivaActivo(params.company_id))) throw bad("La empresa no factura con IVA");
  const where = alcance(params);
  // Los que ya estaban en esa alícuota no cuentan como cambiados. Se cuentan como en el
  // resumen (sin variantes), pero se actualizan también las variantes.
  const pendientes = { ...where, iva_tipo: { [Op.ne]: tipo } };
  const cambiados = await Product.count({ where: { ...pendientes, parent_id: null } });
  const [filas] = await Product.update({ iva_tipo: tipo }, { where: pendientes });
  return { data: { cambiados: filas ? cambiados : 0 } };
}

module.exports = { resumen, aplicar };
