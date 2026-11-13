// Sumar (o quitar) el IVA a los precios de venta, de una vez. Una empresa que empieza a facturar con
// IVA tiene precios que no lo llevan: si un producto de $1,00 sigue en $1,00, la factura separa
// $0,86 de base y $0,14 de IVA, y ese impuesto sale de su ganancia. Esto lo pasa a $1,16.
//
// Nunca es automático: lo pide el administrador en Catálogo → IVA → Precios, con vista previa. Toca
// todos los precios de venta del alcance —el del producto, el de cada sucursal que tenga uno propio,
// las variantes y el precio al mayor—, cada uno con la alícuota de su producto; los exentos no se
// tocan. bulk_price NO es precio de venta (es el costo del empaque comprado) y tampoco se toca.
//
// Cada ajuste guarda el antes y el después de cada precio (iva_price_adjustments), y "Deshacer"
// devuelve exactamente lo que había, salvo los precios que alguien cambió después.
const { sequelize, Sequelize, IvaPriceAdjustment, Employee } = require("../../models");
const { ALICUOTAS, ivaActivo } = require("./iva");

const bad = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const DIRECCIONES = ["sumar", "quitar"];
// Paso del redondeo, en la moneda base. Exacto = 5 decimales, lo que guarda la columna.
const REDONDEOS = { exacto: null, centimo: "0.01", "0.05": "0.05", "0.10": "0.10", "0.50": "0.50", "1": "1" };
// Precios de venta: tabla (p = products, s = product_stock) y columna.
const CAMPOS = [["p", "price"], ["p", "wholesale_price"], ["s", "price"], ["s", "wholesale_price"]];

// Factor de la alícuota del producto (alias p). Los exentos quedan fuera por la condición base.
// Entre paréntesis: va detrás de un "/" al quitar el IVA.
const FACTOR = `((CASE p.iva_tipo WHEN 'R' THEN ${100 + ALICUOTAS.R} WHEN 'A' THEN ${100 + ALICUOTAS.A} ELSE ${100 + ALICUOTAS.G} END)::numeric / 100)`;

// Precio nuevo de la columna `col`. Con redondeo a un paso, nunca baja a cero un precio que tenía.
function nuevoSql(col, direccion, redondeo) {
  const x = direccion === "sumar" ? `${col} * ${FACTOR}` : `${col} / ${FACTOR}`;
  const paso = REDONDEOS[redondeo];
  return paso ? `GREATEST(ROUND((${x}) / ${paso}) * ${paso}, ${paso})` : `ROUND(${x}, 5)`;
}

function validar({ direccion, redondeo }) {
  if (!DIRECCIONES.includes(direccion)) throw bad("Indica si se suma o se quita el IVA");
  if (!(redondeo in REDONDEOS)) throw bad("Redondeo no válido");
}

// Mismo alcance que la alícuota en lote (catalogoIva.js): los marcados con sus variantes, una
// categoría o todo el catálogo. Devuelve SQL sobre el alias p y llena `rep`.
function alcanceSql({ ids, category_id, todos }, rep) {
  if (Array.isArray(ids) && ids.length) {
    const lista = [...new Set(ids.map(n => parseInt(n, 10)).filter(Number.isInteger))];
    if (!lista.length) throw bad("No se recibieron productos");
    rep.ids = lista;
    return "AND (p.id IN (:ids) OR p.parent_id IN (:ids))";
  }
  if (category_id) {
    const cat = parseInt(category_id, 10);
    if (!Number.isInteger(cat)) throw bad("Categoría no válida");
    rep.cat = cat;
    return "AND p.category_id = :cat";
  }
  if (todos) return "";
  throw bad("Indica a qué productos se aplica");
}

// Productos vendibles, no exentos, de la empresa y del alcance. Los insumos no tienen precio de venta.
function condicion(params, rep) {
  rep.co = params.company_id;
  return `p.company_id = :co AND p.sellable IS NOT FALSE AND p.iva_tipo <> 'E' ${alcanceSql(params, rep)}`;
}

async function ajusteVigente(company_id) {
  const aj = await IvaPriceAdjustment.findOne({
    where: { company_id, deshecho_at: null },
    attributes: ["id", "direccion", "redondeo", "productos", "created_at", "created_by"],
    order: [["id", "DESC"]],
  });
  if (!aj) return null;
  const quien = aj.created_by ? await Employee.findByPk(aj.created_by, { attributes: ["full_name", "username"] }) : null;
  return { id: aj.id, direccion: aj.direccion, redondeo: aj.redondeo, productos: aj.productos, created_at: aj.created_at, por: quien?.full_name || quien?.username || null };
}

// Cuántos precios cambian y una muestra, sin escribir nada. También el último ajuste que sigue
// vigente: sumar dos veces cobraría el IVA dos veces, y la pantalla lo advierte.
async function vistaPrevia(params) {
  validar(params);
  const rep = {};
  const cond = condicion(params, rep);
  const repExentos = {};
  const alcanceExentos = alcanceSql(params, repExentos);
  const q = (sql, r = rep) => sequelize.query(sql, { replacements: r, type: Sequelize.QueryTypes.SELECT });
  const [[cuentas], muestra, [exentos], vigente] = await Promise.all([
    q(`SELECT
         COUNT(*) FILTER (WHERE p.parent_id IS NULL AND p.price > 0)::int AS productos,
         COUNT(*) FILTER (WHERE p.parent_id IS NOT NULL AND p.price > 0)::int AS variantes,
         COUNT(*) FILTER (WHERE p.wholesale_price > 0)::int AS mayor,
         (SELECT COUNT(*) FROM product_stock ps JOIN products p ON p.id = ps.product_id
           WHERE ${cond} AND ps.company_id = :co AND (ps.price > 0 OR ps.wholesale_price > 0))::int AS sucursales
       FROM products p WHERE ${cond}`),
    q(`SELECT p.id, p.name, p.iva_tipo, p.price AS antes, ${nuevoSql("p.price", params.direccion, params.redondeo)} AS despues
         FROM products p
        WHERE ${cond} AND p.parent_id IS NULL AND p.price > 0
        ORDER BY p.name
        LIMIT 6`),
    q(`SELECT COUNT(*)::int AS n FROM products p
        WHERE p.company_id = :co AND p.sellable IS NOT FALSE AND p.iva_tipo = 'E' AND p.parent_id IS NULL ${alcanceExentos}`,
      { ...repExentos, co: params.company_id }),
    ajusteVigente(params.company_id),
  ]);
  return {
    data: {
      ...cuentas,
      exentos: exentos.n,
      muestra: muestra.map(m => ({ ...m, antes: parseFloat(m.antes), despues: parseFloat(m.despues) })),
      vigente,
    },
  };
}

async function aplicar({ employee_id, ...params }) {
  validar(params);
  if (!(await ivaActivo(params.company_id))) throw bad("La empresa no factura con IVA");
  const rep = {};
  const cond = condicion(params, rep);
  const t = await sequelize.transaction();
  try {
    const cambios = [];
    for (const [tabla, f] of CAMPOS) {
      const nuevo = nuevoSql(tabla === "p" ? `p.${f}` : `ps.${f}`, params.direccion, params.redondeo);
      const sql = tabla === "p"
        ? `WITH o AS (SELECT p.id, p.${f} AS a, ${nuevo} AS d FROM products p WHERE ${cond} AND p.${f} > 0)
           UPDATE products x SET ${f} = o.d FROM o WHERE x.id = o.id AND o.d <> o.a
           RETURNING x.id, o.a, o.d`
        : `WITH o AS (SELECT ps.product_id, ps.warehouse_id, ps.${f} AS a, ${nuevo} AS d
                        FROM product_stock ps JOIN products p ON p.id = ps.product_id
                       WHERE ${cond} AND ps.company_id = :co AND ps.${f} > 0)
           UPDATE product_stock x SET ${f} = o.d FROM o
            WHERE x.product_id = o.product_id AND x.warehouse_id = o.warehouse_id AND o.d <> o.a
           RETURNING x.product_id AS id, x.warehouse_id AS w, o.a, o.d`;
      const [filas] = await sequelize.query(sql, { replacements: rep, transaction: t });
      for (const r of filas) cambios.push({ t: tabla, id: r.id, ...(r.w != null ? { w: r.w } : {}), f, a: String(r.a), d: String(r.d) });
    }
    if (!cambios.length) {
      await t.rollback();
      return { data: { id: null, productos: 0, precios: 0 } };
    }
    const productos = new Set(cambios.map(c => c.id)).size;
    const { ids, category_id, todos } = params;
    const aj = await IvaPriceAdjustment.create({
      company_id: params.company_id,
      direccion: params.direccion,
      redondeo: params.redondeo,
      alcance: ids?.length ? { ids } : category_id ? { category_id } : { todos: !!todos },
      productos,
      cambios,
      created_by: employee_id || null,
    }, { transaction: t });
    await t.commit();
    return { data: { id: aj.id, productos, precios: cambios.length } };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// Deshace el último ajuste vigente. Cada precio vuelve a lo que tenía solo si sigue en el valor que
// dejó el ajuste: uno que alguien cambió después (a mano o al recibir una compra) se respeta.
async function deshacer({ company_id, employee_id }) {
  const aj = await IvaPriceAdjustment.findOne({ where: { company_id, deshecho_at: null }, order: [["id", "DESC"]] });
  if (!aj) throw bad("No hay ningún ajuste de precios para deshacer");
  const t = await sequelize.transaction();
  try {
    const rep = { co: company_id, cambios: JSON.stringify(aj.cambios || []) };
    const json = `jsonb_to_recordset(CAST(:cambios AS jsonb)) AS c(t text, id int, w int, f text, a numeric, d numeric)`;
    let restaurados = 0;
    for (const [tabla, f] of CAMPOS) {
      const sql = tabla === "p"
        ? `UPDATE products x SET ${f} = c.a FROM ${json}
            WHERE c.t = 'p' AND c.f = '${f}' AND x.id = c.id AND x.company_id = :co AND x.${f} = c.d
           RETURNING x.id`
        : `UPDATE product_stock x SET ${f} = c.a FROM ${json}
            WHERE c.t = 's' AND c.f = '${f}' AND x.product_id = c.id AND x.warehouse_id = c.w
              AND x.company_id = :co AND x.${f} = c.d
           RETURNING x.product_id`;
      const [filas] = await sequelize.query(sql, { replacements: rep, transaction: t });
      restaurados += filas.length;
    }
    await aj.update({ deshecho_at: new Date(), deshecho_by: employee_id || null }, { transaction: t });
    await t.commit();
    const total = (aj.cambios || []).length;
    return { data: { id: aj.id, direccion: aj.direccion, restaurados, omitidos: total - restaurados } };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

module.exports = { vistaPrevia, aplicar, deshacer, REDONDEOS };
