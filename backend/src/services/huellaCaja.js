const { huella } = require("../utils/huella");

// Huellas de lo que la caja (y cualquier pantalla con sesión) vuelve a pedir cada pocos
// segundos: la grilla de productos, las cuentas en espera, las promociones vigentes y las
// monedas. Antes cada una se pedía entera por su lado —cuatro invocaciones por vuelta y por
// equipo, la mitad del tráfico del backend en Vercel—, y casi siempre volvía igual (304).
// Ahora el equipo pregunta UNA vez "¿cambió algo?" y solo pide lo que cambió.
//
// Cada huella es el md5 de las filas tal cual (`fila::text`), no de `updated_at`: products y
// product_stock no llevan timestamps de Sequelize y el stock se mueve con UPDATE directos, así
// que una fecha de modificación se quedaría quieta mientras cambian las existencias.
//
// Las cuatro van en una sola consulta (un viaje a la base) y la respuesta vive unos segundos en
// memoria del proceso: las cajas de una misma sucursal comparten el cálculo.

const QUE = ["productos", "cuentas", "promos", "monedas"];

// La grilla de la caja (warehouses/stockService.getProducts) sale de productos, existencias y
// precio de la sucursal, categorías, combos y grupos de adicionales.
const SQL_PRODUCTOS = `md5(
     COALESCE((SELECT string_agg(ps::text, ',' ORDER BY ps.product_id) FROM product_stock ps WHERE ps.warehouse_id = :wid), '')
  || COALESCE((SELECT string_agg(p::text, ',' ORDER BY p.id) FROM products p WHERE p.company_id = :cid), '')
  || COALESCE((SELECT string_agg(c::text, ',' ORDER BY c.id) FROM categories c WHERE c.company_id = :cid), '')
  || COALESCE((SELECT string_agg(ci::text, ',' ORDER BY ci.combo_id, ci.product_id) FROM product_combo_items ci WHERE ci.company_id = :cid), '')
  || COALESCE((SELECT string_agg(concat(pmg.product_id, ':', pmg.group_id, ':', mg.active), ',' ORDER BY pmg.product_id, pmg.group_id)
                 FROM product_modifier_groups pmg JOIN modifier_groups mg ON mg.id = pmg.group_id
                WHERE mg.company_id = :cid), '')
)`;

// Mismo alcance que getAllSales con warehouse_id: las cuentas de la sucursal más los pedidos
// del catálogo que pidieron esa tienda (o ninguna). La fila completa cubre la toma de la
// cuenta (held_by_employee_id), la cocina y el total; las líneas y los cobros, lo demás.
const SQL_CUENTAS = `(
  WITH held AS (
    SELECT s.* FROM sales s
     WHERE s.company_id = :cid
       AND s.status IN ('espera', 'pedido')
       AND (s.warehouse_id = :wid
            OR (s.warehouse_id IS NULL AND s.status = 'pedido'
                AND (s.requested_warehouse_id IS NULL OR s.requested_warehouse_id = :wid)))
  )
  SELECT md5(
       COALESCE((SELECT string_agg(h::text, ',' ORDER BY h.id) FROM held h), '')
    || COALESCE((SELECT string_agg(si::text, ',' ORDER BY si.id) FROM sale_items si WHERE si.sale_id IN (SELECT id FROM held)), '')
    || COALESCE((SELECT string_agg(concat(pa.id, ':', pa.amount), ',' ORDER BY pa.id) FROM payments pa WHERE pa.sale_id IN (SELECT id FROM held)), '')
  )
)`;

// Las vigentes AHORA, igual que promotions.getActive: una promo que vence o empieza cambia
// la huella sin que nadie la toque.
const SQL_PROMOS = `(
  SELECT md5(COALESCE(string_agg(
           pr::text || '#' || COALESCE((SELECT string_agg(pp.product_id::text, ',' ORDER BY pp.product_id)
                                          FROM promotion_products pp WHERE pp.promotion_id = pr.id), ''),
           ',' ORDER BY pr.id), ''))
    FROM promotions pr
   WHERE pr.company_id = :cid AND pr.active
     AND pr.starts_at <= now() AND (pr.ends_at IS NULL OR pr.ends_at >= now())
     AND (pr.warehouse_id IS NULL OR pr.warehouse_id = :wid)
)`;

const SQL_MONEDAS = `(
  SELECT md5(COALESCE(string_agg(cu::text, ',' ORDER BY cu.id), '')) FROM currencies cu WHERE cu.company_id = :cid
)`;

const SQL = { productos: SQL_PRODUCTOS, cuentas: SQL_CUENTAS, promos: SQL_PROMOS, monedas: SQL_MONEDAS };

// Las cajas de una sucursal preguntan cada 25 s: 3 s de caché basta para que compartan la
// consulta, y nunca atrasa un cambio más que eso.
const TTL_MS = 3000;

/**
 * Huellas pedidas (`que`) para la empresa y la sucursal. Sin sucursal solo se calculan las
 * monedas: lo demás depende de la tienda.
 */
async function huellasCaja({ companyId, warehouseId, que }) {
  const wid = parseInt(warehouseId, 10) || null;
  const pedidas = QUE.filter(k => que.includes(k) && (k === "monedas" || wid));
  if (!pedidas.length) return {};

  const cols = pedidas.map(k => `'${k}', ${SQL[k]}`).join(", ");
  const v = await huella(
    `caja:${companyId}:${wid || 0}:${pedidas.join(".")}`,
    `SELECT json_build_object(${cols})::text AS v`,
    { cid: companyId, wid },
    TTL_MS,
  );
  return JSON.parse(v);
}

module.exports = { huellasCaja, QUE };
