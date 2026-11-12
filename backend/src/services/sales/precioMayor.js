const { sequelize, Sequelize } = require("../../models");
const { calcLineDiscount } = require("./promoDiscounts");

// Venta al mayor (12-11-2026). Qué líneas de una venta se cobran al precio al mayor.
//
// Reglas decididas con el usuario:
//  - Va al mayor si el cliente es MAYORISTA (customers.price_level = 'mayor') o si la línea
//    llega a la cantidad mínima del producto ("al mayor desde"). Cualquiera de las dos.
//  - Precio al mayor y mínimo son los de la sucursal de la venta (product_stock pisa al
//    producto, igual que el precio detal).
//  - Variantes: la cantidad suma TODO el modelo (3 rojas + 3 azules = 6), en todas las líneas.
//  - Promoción y precio al mayor NO se acumulan: se cobra lo más bajo entre el precio al mayor
//    y el detal con su promoción. Si gana la promoción, la línea queda en detal con promoción.
//  - El descuento manual de la caja sí va sobre el precio al mayor: lo da el cajero, a sabiendas
//    y con su permiso y su tope (ver lineDiscount.js).
//  - Lo pactado en una cotización no se toca.
//  - Sin precio al mayor cargado, la línea queda en detal.
//
// La misma cuenta la hace la caja en frontend/src/helpers/precioMayor.js: lo que se ve en el
// carrito es lo que se factura. Si se cambia una, se cambia la otra.

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const q = (sql, replacements, transaction) =>
  sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT, transaction });

/**
 * Lo que hace falta para decidir, en tres consultas fijas. null = la empresa no vende al mayor
 * (nada cambia). productos: Map(id → { parent_id, price, wholesale_price, wholesale_min_qty }).
 */
async function cargarMayor({ warehouse_id, customer_id, product_ids, transaction }) {
  const wid = parseInt(warehouse_id, 10);
  const ids = [...new Set((product_ids || []).map((n) => parseInt(n, 10)).filter(Number.isInteger))];
  if (!wid || !ids.length) return null;

  const [empresa] = await q(
    `SELECT c.id, c.mayor_enabled FROM warehouses w JOIN companies c ON c.id = w.company_id WHERE w.id = :wid`,
    { wid }, transaction);
  if (!empresa?.mayor_enabled) return null;

  const cid = parseInt(customer_id, 10) || null;
  const [cliente] = cid
    ? await q(`SELECT price_level FROM customers WHERE id = :cid AND company_id = :emp`, { cid, emp: empresa.id }, transaction)
    : [];

  const filas = await q(`
    SELECT p.id, p.parent_id,
           COALESCE(ps.price, p.price)::float AS price,
           COALESCE(ps.wholesale_price, p.wholesale_price)::float AS wholesale_price,
           COALESCE(ps.wholesale_min_qty, p.wholesale_min_qty)::float AS wholesale_min_qty
      FROM products p
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
     WHERE p.id IN (:ids) AND p.company_id = :emp`,
    { wid, ids, emp: empresa.id }, transaction);

  return {
    mayorista: cliente?.price_level === "mayor",
    productos: new Map(filas.map((f) => [f.id, f])),
  };
}

/**
 * Decide línea por línea. lineas: [{ product_id, qty, base, manual, pactado }], donde `base` es el
 * precio detal de la línea. Devuelve, en el mismo orden, null (va en detal) o { price } (precio
 * al mayor por unidad).
 */
function decidirMayor(regla, lineas, promos = []) {
  if (!regla) return lineas.map(() => null);

  // Cantidad por grupo: el modelo para una variante, el propio producto si no lo es.
  const grupoDe = (p) => p.parent_id ?? p.id;
  const cantidadGrupo = new Map();
  for (const l of lineas) {
    const p = regla.productos.get(parseInt(l.product_id, 10));
    const qty = parseFloat(l.qty) || 0;
    if (!p || !(qty > 0)) continue;
    cantidadGrupo.set(grupoDe(p), (cantidadGrupo.get(grupoDe(p)) || 0) + qty);
  }

  return lineas.map((l) => {
    if (l.pactado) return null;
    const p = regla.productos.get(parseInt(l.product_id, 10));
    const qty = parseFloat(l.qty) || 0;
    if (!p || p.wholesale_price == null || !(qty > 0)) return null;

    const minimo = p.wholesale_min_qty;
    const porCantidad = minimo > 0 && cantidadGrupo.get(grupoDe(p)) >= minimo - 1e-9;
    if (!regla.mayorista && !porCantidad) return null;

    // Lo más bajo para el cliente: el detal con su promoción (si no hay descuento manual, que
    // reemplaza a la promoción) contra el precio al mayor. Empate = al mayor.
    const base = round2(l.base);
    const promo = l.manual ? 0 : calcLineDiscount(parseInt(l.product_id, 10), base, qty, promos);
    if (round2(p.wholesale_price) * qty > base * qty - promo + 1e-9) return null;
    return { price: p.wholesale_price };
  });
}

module.exports = { cargarMayor, decidirMayor };
