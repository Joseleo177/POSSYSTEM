/**
 * Pruebas de punta a punta del módulo Fábrica contra un backend en marcha.
 *
 * SOLO contra una base de desarrollo: crea materiales, compras, órdenes y una factura. Se
 * corre dentro del contenedor del backend:
 *
 *   docker cp backend/tests/fabrica.e2e.js pos_backend:/tmp/ && docker exec \
 *     -e TOKEN=... -e TOKEN_NOPERM=... -e FOREIGN_WAREHOUSE=... -e CUSTOMER_ID=... \
 *     -e WH=1 -e WH2=3 -e SERIE_WH2=9 pos_backend node /tmp/fabrica.e2e.js
 *
 *   TOKEN              admin de una empresa con fabrica_enabled
 *   TOKEN_NOPERM       mismo empleado y empresa, sin permisos
 *   FOREIGN_WAREHOUSE  id de un almacén de OTRA empresa
 *   CUSTOMER_ID        un cliente de la empresa
 *   WH / WH2           dos almacenes de la empresa; SERIE_WH2 una serie de factura de WH2
 *
 * Sale con código 1 si algo falla. Imprime los ids creados para limpiarlos después.
 */
const API = process.env.API || "http://localhost:4000/api";
const E = process.env;
const WH = parseInt(E.WH || 1), WH2 = parseInt(E.WH2 || 3);

let fallos = 0, pasos = 0;
const creados = { products: [], purchases: [], orders: [], sales: [] };

async function call(method, path, body, token = E.TOKEN) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(API + path, { method, headers, body: payload });
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, ...j };
}
const ok = (label, r) => {
  pasos++;
  if (!r.ok) { fallos++; console.log(`FALLO  ${label} → ${r.status} ${r.message}`); }
  else console.log(`ok     ${label}`);
  return r;
};
const no = (label, r, status) => {
  pasos++;
  if (r.ok || (status && r.status !== status) || r.status >= 500) {
    fallos++; console.log(`FALLO  ${label} → debía rechazar${status ? ` con ${status}` : ""}, dio ${r.status} ${r.message || ""}`);
  } else console.log(`ok     ${label} → ${r.status} ${r.message}`);
  return r;
};
const eq = (label, a, b) => {
  pasos++;
  const iguales = typeof b === "number" ? Math.abs(Number(a) - b) < 1e-6 : a === b;
  if (!iguales) { fallos++; console.log(`FALLO  ${label}: ${a} ≠ ${b}`); }
  else console.log(`ok     ${label} = ${b}`);
};
const stockOf = async (pid, wid = WH) => {
  const r = await call("GET", `/factory/materials?warehouse_id=${wid}`);
  return r.data.find(m => m.id === pid);
};

(async () => {
  // ── Seguridad ─────────────────────────────────────────────────────────────────────────
  no("sin token", await call("GET", "/factory/orders", undefined, "x"), 401);
  no("sin permiso factory.view", await call("GET", "/factory/orders", undefined, E.TOKEN_NOPERM), 403);
  no("sin permiso factory.manage", await call("POST", "/factory/orders", { warehouse_id: WH, description: "x" }, E.TOKEN_NOPERM), 403);
  no("almacén de otra empresa (orden)", await call("POST", "/factory/orders", { warehouse_id: E.FOREIGN_WAREHOUSE, description: "x" }), 404);
  no("almacén de otra empresa (filtro)", await call("GET", `/factory/pieces?warehouse_id=${E.FOREIGN_WAREHOUSE}`), 404);
  ok("búsqueda con comillas y comodines", await call("GET", `/factory/orders?status=todas&search=${encodeURIComponent("'; DROP TABLE sales;-- %_")}`));
  ok("estado desconocido cae al de siempre", await call("GET", "/factory/pieces?status=<script>"));
  no("cantidad desbordada", await call("POST", "/factory/orders", { warehouse_id: WH, description: "x", quantity: 1e12 }), 400);
  no("precio desbordado", await call("POST", "/factory/orders", { warehouse_id: WH, description: "x", sale_price: 1e12 }), 400);
  no("precio negativo", await call("POST", "/factory/orders", { warehouse_id: WH, description: "x", sale_price: -5 }), 400);
  no("pieza inexistente", await call("GET", "/factory/pieces/999999999"), 404);
  no("id no numérico", await call("GET", "/factory/orders/abc"), 404);

  // ── Material por área creado desde el catálogo (es un producto) ───────────────────────
  const fd = new FormData();
  fd.append("name", `QA Lámina inox 304 cal 18 ${Date.now()}`);
  fd.append("price", "0"); fd.append("sellable", "false");
  fd.append("piece_mode", "area"); fd.append("piece_width_mm", "1220"); fd.append("piece_length_mm", "2440");
  const prod = ok("crear material desde Catálogo", await call("POST", "/products", fd));
  const pid = prod.data.id; creados.products.push(pid);
  eq("la unidad pasa a M2", prod.data.unit, "M2");
  eq("modo por área", prod.data.piece_mode, "area");

  // ── Compra con piezas: se numeran al recibir ──────────────────────────────────────────
  no("compra con media pieza", await call("POST", "/purchases", {
    warehouse_id: WH, status: "recibido",
    items: [{ product_id: pid, package_qty: 2.5, package_price: 120, piece_width_mm: 1220, piece_length_mm: 2440 }],
  }), 400);
  const compra = ok("compra de 3 láminas recibida", await call("POST", "/purchases", {
    warehouse_id: WH, status: "recibido",
    items: [{ product_id: pid, package_qty: 3, package_price: 120, piece_width_mm: 1220, piece_length_mm: 2440 }],
  }));
  creados.purchases.push(compra.data.id);
  eq("la línea es por pieza", compra.data.items[0].package_unit, "PIEZA");
  eq("tamaño de la pieza calculado por el servidor", parseFloat(compra.data.items[0].package_size), 2.977);
  let m = await stockOf(pid);
  eq("existencia en m²", m.stock, 8.931);
  eq("todo numerado", m.unnumbered, 0);
  eq("3 piezas disponibles", m.available, 3);
  let piezas = (await call("GET", `/factory/pieces?product_id=${pid}`)).data.sort((a, b) => a.root_number - b.root_number);
  eq("costo por m² con 4 decimales", piezas[0].unit_cost, 40.309);

  // Anular la compra da de baja sus piezas y saca la existencia.
  ok("anular compra sin usar", await call("DELETE", `/purchases/${compra.data.id}`));
  m = await stockOf(pid);
  eq("existencia tras anular", m.stock, 0);
  eq("sin piezas vivas", m.available, 0);

  const compra2 = ok("segunda compra de 2 láminas", await call("POST", "/purchases", {
    warehouse_id: WH, status: "recibido",
    items: [{ product_id: pid, package_qty: 2, package_price: 150, piece_width_mm: 1220, piece_length_mm: 2440 }],
  }));
  creados.purchases.push(compra2.data.id);
  piezas = (await call("GET", `/factory/pieces?product_id=${pid}`)).data.sort((a, b) => a.root_number - b.root_number);
  const [p1, p2] = piezas;

  // ── Catálogo: reglas del producto por piezas ──────────────────────────────────────────
  const fd2 = new FormData(); fd2.append("unit", "UNIDAD");
  no("cambiar la unidad con piezas", await call("PUT", `/products/${pid}`, fd2), 400);
  no("borrar producto con historial", await call("DELETE", `/products/${pid}`), 400);
  no("transferir material por piezas", await call("POST", "/warehouses/transfer", { from_warehouse_id: WH, to_warehouse_id: WH2, items: [{ product_id: pid, qty: 1 }] }), 400);

  // ── Orden a medida para cliente ───────────────────────────────────────────────────────
  const o1 = ok("orden a medida", await call("POST", "/factory/orders", {
    warehouse_id: WH, description: "QA Mesón 1,50 × 0,60", quantity: 3, customer_id: E.CUSTOMER_ID, sale_price: 100,
  }));
  creados.orders.push(o1.data.id);
  ok("entregar lámina", await call("POST", `/factory/orders/${o1.data.id}/pieces`, { piece_id: p1.id }));
  no("anular la compra con la pieza en el taller", await call("DELETE", `/purchases/${compra2.data.id}`), 400);
  let od = (await call("GET", `/factory/orders/${o1.data.id}`)).data;
  const u1 = od.uses[0].id;
  no("retazo que no cabe", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/return`, { remnants: [{ width_mm: 1300, length_mm: 1300 }] }), 400);
  no("retazo con medidas absurdas", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/return`, { remnants: [{ width_mm: 1e9, length_mm: 5 }] }), 400);
  no("retazos que suman más", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/return`, { remnants: [{ width_mm: 1220, length_mm: 2000 }, { width_mm: 1220, length_mm: 1000 }] }), 400);
  ok("devolver con 2 retazos", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/return`, {
    remnants: [{ width_mm: 1220, length_mm: 840 }, { irregular: true, size: 0.35 }], note: "<b>Mesón</b> a lo largo",
  }));
  ok("deshacer devolución", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/undo`));
  ok("devolver otra vez", await call("POST", `/factory/orders/${o1.data.id}/pieces/${u1}/return`, {
    remnants: [{ width_mm: 1220, length_mm: 840 }],
  }));
  od = (await call("GET", `/factory/orders/${o1.data.id}`)).data;
  eq("el retazo nuevo no repite número", od.uses[0].remnants[0].code, `${p1.code}-3`);
  eq("consumido", od.uses[0].consumed, 1.952);
  eq("costo del material (4 decimales)", od.material_cost, 98.3541);
  eq("costo por m² heredado por el retazo", od.uses[0].remnants.length, 1);
  m = await stockOf(pid);
  eq("existencia cuadra con las piezas", m.unnumbered, 0);

  ok("terminar", await call("POST", `/factory/orders/${o1.data.id}/finish`));
  no("serie de otro almacén", await call("POST", `/factory/orders/${o1.data.id}/invoice`, { serie_id: E.SERIE_WH2 }), 400);

  // Factura en el otro almacén: 100 entre 3 unidades.
  const o2 = ok("orden en el almacén 2", await call("POST", "/factory/orders", {
    warehouse_id: WH2, description: "QA Campana", quantity: 3, customer_id: E.CUSTOMER_ID, sale_price: 100,
  }));
  creados.orders.push(o2.data.id);
  const inv = ok("facturar", await call("POST", `/factory/orders/${o2.data.id}/invoice`, { serie_id: E.SERIE_WH2 }));
  if (inv.ok) creados.sales.push(inv.data.sale_id);
  od = (await call("GET", `/factory/orders/${o2.data.id}`)).data;
  eq("orden y factura dicen la misma cifra", od.sale_price, inv.data.total);
  eq("factura con precios de 5 decimales", inv.data.total, 99.99999);
  no("facturar dos veces", await call("POST", `/factory/orders/${o2.data.id}/invoice`, { serie_id: E.SERIE_WH2 }), 400);
  await call("PATCH", `/factory/orders/${o2.data.id}`, { sale_price: 1 });
  eq("el precio no cambia con factura viva", (await call("GET", `/factory/orders/${o2.data.id}`)).data.sale_price, od.sale_price);
  no("anular orden facturada", await call("POST", `/factory/orders/${o2.data.id}/cancel`, { reason: "x" }), 400);

  // ── Material por longitud (tubos) ─────────────────────────────────────────────────────
  const tubo = ok("material por longitud", await call("POST", "/factory/materials", {
    name: `QA Tubo inox 1" ${Date.now()}`, piece_mode: "length", piece_length_mm: 6000,
  }));
  creados.products.push(tubo.data.id);
  eq("la unidad pasa a METRO", tubo.data.unit, "METRO");
  const carga = ok("carga inicial de 2 tubos", await call("POST", "/factory/pieces", {
    product_id: tubo.data.id, warehouse_id: WH, origin: "carga_inicial", count: 2, length_mm: 6000, cost_per_piece: 30,
  }));
  m = await stockOf(tubo.data.id);
  eq("existencia en metros", m.stock, 12);
  const fit = await call("GET", `/factory/pieces?product_id=${tubo.data.id}&fit_l=5000`);
  eq("buscador por largo", fit.data.length, 2);
  const o3 = ok("orden estándar a inventario", await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: 17, quantity: 2,
  }));
  creados.orders.push(o3.data.id);
  no("cantidad con decimales en producto por unidad", await call("PATCH", `/factory/orders/${o3.data.id}`, { quantity: 1.5 }), 400);
  ok("entregar tubo", await call("POST", `/factory/orders/${o3.data.id}/pieces`, { piece_id: carga.data[0].id }));
  od = (await call("GET", `/factory/orders/${o3.data.id}`)).data;
  no("retazo más largo que el tubo", await call("POST", `/factory/orders/${o3.data.id}/pieces/${od.uses[0].id}/return`, { remnants: [{ length_mm: 7000 }] }), 400);
  ok("devolver tubo con un retazo", await call("POST", `/factory/orders/${o3.data.id}/pieces/${od.uses[0].id}/return`, { remnants: [{ length_mm: 2500 }] }));
  ok("accesorio", await call("POST", `/factory/orders/${o3.data.id}/items`, { product_id: 28, quantity: 2 }));
  no("material por piezas como accesorio", await call("POST", `/factory/orders/${o3.data.id}/items`, { product_id: pid, quantity: 1 }), 400);
  ok("terminar (entra al inventario)", await call("POST", `/factory/orders/${o3.data.id}/finish`));
  od = (await call("GET", `/factory/orders/${o3.data.id}`)).data;
  eq("costo del tubo consumido", od.material_cost, 17.5);

  // ── Etapas del taller ─────────────────────────────────────────────────────────────────
  const pre = ok("etapas predefinidas", await call("POST", "/factory/stages/presets"));
  no("predefinidas dos veces", await call("POST", "/factory/stages/presets"), 400);
  const corte = pre.data.find(s => s.name === "Corte");
  const soldadura = pre.data.find(s => s.name === "Soldadura");
  ok("costo por hora de Corte", await call("PUT", `/factory/stages/${corte.id}`, { name: "Corte", cost_per_hour: 6 }));
  ok("costo por hora de Soldadura", await call("PUT", `/factory/stages/${soldadura.id}`, { name: "Soldadura", cost_per_hour: 9 }));
  no("etapa con nombre repetido", await call("POST", "/factory/stages", { name: "corte" }), 400);
  no("costo por hora negativo", await call("PUT", `/factory/stages/${corte.id}`, { name: "Corte", cost_per_hour: -1 }), 400);
  const extra = ok("etapa nueva", await call("POST", "/factory/stages", { name: "QA Inspección", cost_per_hour: 4 }));
  ok("borrar etapa sin uso", await call("DELETE", `/factory/stages/${extra.data.id}`));

  // ── Recetas: "si pido Vaso, ya se sabe qué lleva" ─────────────────────────────────────
  const fdv = new FormData();
  fdv.append("name", `QA Vaso ${Date.now()}`); fdv.append("price", "25"); fdv.append("unit", "UNIDAD");
  const vaso = ok("producto terminado", await call("POST", "/products", fdv));
  creados.products.push(vaso.data.id);
  const lamina2 = ok("material para la receta", await call("POST", "/factory/materials", {
    name: `QA Lámina receta ${Date.now()}`, piece_mode: "area", piece_width_mm: 1220, piece_length_mm: 2440,
  }));
  creados.products.push(lamina2.data.id);
  const hojas = ok("2 láminas para la receta", await call("POST", "/factory/pieces", {
    product_id: lamina2.data.id, warehouse_id: WH, origin: "carga_inicial", count: 2, width_mm: 1220, length_mm: 2440, cost_per_piece: 120,
  }));
  const receta = {
    unit: "m",
    instructions: "Cortar las dos caras, doblar y soldar.",
    items: [
      { component_id: lamina2.data.id, width_expr: "0,4", length_expr: "0,6", cuts_expr: "2" },
      { component_id: 28, quantity_expr: "2" },
      { stage_id: corte.id, minutes_expr: "10" },
      { stage_id: soldadura.id, minutes_expr: "20" },
    ],
  };
  no("receta vacía", await call("PUT", `/factory/recipes/${vaso.data.id}`, { items: [] }), 400);
  no("receta para un material", await call("PUT", `/factory/recipes/${lamina2.data.id}`, receta), 400);
  no("producto que se lleva a sí mismo", await call("PUT", `/factory/recipes/${vaso.data.id}`, { items: [{ component_id: vaso.data.id, quantity_expr: "1" }] }), 400);
  no("corte sin ancho", await call("PUT", `/factory/recipes/${vaso.data.id}`, { items: [{ component_id: lamina2.data.id, length_expr: "0,6", cuts_expr: "2" }] }), 400);
  no("receta sin permiso", await call("PUT", `/factory/recipes/${vaso.data.id}`, receta, E.TOKEN_NOPERM), 403);
  ok("guardar receta", await call("PUT", `/factory/recipes/${vaso.data.id}`, receta));
  const prev = ok("estimado para 3 vasos", await call("GET", `/factory/recipes/${vaso.data.id}/preview?quantity=3&warehouse_id=${WH}`));
  const lm = prev.data.lines.find(l => l.kind === "material");
  const la = prev.data.lines.find(l => l.kind === "accesorio");
  const lc = prev.data.lines.find(l => l.kind === "proceso" && l.stage_id === corte.id);
  eq("material esperado: 2 cortes × 0,24 m² × 3", lm.expected, 1.44);
  eq("costo del material al costo por m²", lm.cost, 58.045);
  eq("accesorios esperados", la.expected, 6);
  eq("minutos de corte para 3", lc.expected, 30);
  eq("mano de obra de corte (30 min a 6/h)", lc.cost, 3);
  eq("costo estimado total", prev.data.total_cost, Math.round((58.045 + la.cost + 3 + 9) * 10000) / 10000);
  const prev2 = ok("estimado sin almacén", await call("GET", `/factory/recipes/${vaso.data.id}/preview?quantity=3`));
  eq("material estimado sin almacén", prev2.data.lines.find(l => l.kind === "material").cost, 58.045);

  // ── Recetas con fórmulas: lo hecho a medida ───────────────────────────────────────────
  const fdm = new FormData();
  fdm.append("name", `QA Mesón ${Date.now()}`); fdm.append("price", "300"); fdm.append("unit", "UNIDAD");
  const meson = ok("producto a medida", await call("POST", "/products", fdm));
  creados.products.push(meson.data.id);
  const params = [
    { key: "L", label: "Largo", kind: "medida", default: 1.8 },
    { key: "A", label: "Ancho", kind: "medida", default: 0.6 },
    { key: "P", label: "Puertas", kind: "numero", default: 2 },
  ];
  const recetaMeson = {
    unit: "m", params,
    items: [
      { component_id: lamina2.data.id, width_expr: "A + 0,25", length_expr: "L + 0,1", cuts_expr: "1" },
      { component_id: 28, quantity_expr: "P * 2" },
      { stage_id: soldadura.id, minutes_expr: "20 + L * 10" },
    ],
  };
  no("fórmula con variable desconocida", await call("PUT", `/factory/recipes/${meson.data.id}`, { ...recetaMeson, items: [{ component_id: 28, quantity_expr: "Q * 2" }] }), 400);
  no("variable con nombre de función", await call("PUT", `/factory/recipes/${meson.data.id}`, { ...recetaMeson, params: [{ key: "MIN", default: 1 }] }), 400);
  no("fórmula que da un corte negativo", await call("PUT", `/factory/recipes/${meson.data.id}`, { ...recetaMeson, items: [{ component_id: lamina2.data.id, width_expr: "A - 5", length_expr: "L", cuts_expr: "1" }] }), 400);
  no("fórmula con código", await call("PUT", `/factory/recipes/${meson.data.id}`, { ...recetaMeson, items: [{ component_id: 28, quantity_expr: "process.exit()" }] }), 400);
  ok("probar borrador sin guardar", await call("POST", "/factory/recipes/evaluate", { ...recetaMeson, product_id: meson.data.id }));
  ok("guardar receta con fórmulas", await call("PUT", `/factory/recipes/${meson.data.id}`, recetaMeson));
  const pm = ok("mesón de 2,40 × 0,70", await call("GET", `/factory/recipes/${meson.data.id}/preview?quantity=1&warehouse_id=${WH}&params=${encodeURIComponent(JSON.stringify({ L: 2.4, A: 0.7 }))}`));
  const pmm = pm.data.lines.find(l => l.kind === "material");
  eq("corte calculado: ancho", pmm.cut_width_mm, 950);
  eq("corte calculado: largo", pmm.cut_length_mm, 2500);
  eq("área del corte", pmm.expected, 2.375);
  eq("bisagras = puertas × 2 (por defecto)", pm.data.lines.find(l => l.kind === "accesorio").expected, 4);
  eq("minutos = 20 + L × 10", pm.data.lines.find(l => l.kind === "proceso").expected, 44);
  const om = ok("orden a medida con valores", await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "medida", destination: "cliente", product_id: meson.data.id, quantity: 1,
    params: { L: 2.4, A: 0.7, P: 3 }, due_date: "2026-11-05", assignee: "Pedro",
  }));
  creados.orders.push(om.data.id);
  const omd = (await call("GET", `/factory/orders/${om.data.id}`)).data;
  eq("la orden guarda sus valores", omd.params.find(p => p.key === "P").value, 3);
  eq("plan calculado con esos valores", omd.plan.lines.find(l => l.kind === "accesorio").expected, 6);
  eq("fecha comprometida", omd.due_date, "2026-11-05");
  no("valor de variable inválido", await call("POST", "/factory/orders", {
    warehouse_id: WH, product_id: meson.data.id, params: { L: "abc" },
  }), 400);
  no("fecha inválida", await call("PATCH", `/factory/orders/${om.data.id}`, { due_date: "mañana" }), 400);

  // ── Orden estándar por el taller: etapas y mano de obra ───────────────────────────────
  const ov = ok("orden estándar de 3 vasos", await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: vaso.data.id, quantity: 3,
  }));
  creados.orders.push(ov.data.id);
  let ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("la orden trae la receta", ovd.plan?.lines?.length, 4);
  eq("y sus instrucciones", ovd.instructions, receta.instructions);
  ok("editar la receta después", await call("PUT", `/factory/recipes/${vaso.data.id}`, { unit: "m", items: [{ component_id: 28, quantity_expr: "5" }] }));
  ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("la orden conserva su copia", ovd.plan.lines.length, 4);

  // Entregar para un corte de la receta: valida material, que alcance y lo que falta.
  const ovp = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  const lineaCorte = ovp.plan.lines.find(l => l.kind === "material");
  eq("el corte empieza sin pieza", lineaCorte.cuts_missing, 6);
  const tuboLibre = (await call("GET", `/factory/pieces?product_id=${tubo.data.id}&status=disponible`)).data[0];
  no("pieza de otro material para el corte", await call("POST", `/factory/orders/${ov.data.id}/pieces`, { piece_id: tuboLibre.id, plan_id: lineaCorte.id }), 400);
  const chica = ok("retazo chico para probar", await call("POST", "/factory/pieces", {
    product_id: lamina2.data.id, warehouse_id: WH, origin: "carga_inicial", count: 1, width_mm: 300, length_mm: 300, cost_per_piece: 1,
  }));
  no("pieza que no alcanza ni para un corte", await call("POST", `/factory/orders/${ov.data.id}/pieces`, { piece_id: chica.data[0].id, plan_id: lineaCorte.id }), 400);
  const ent = ok("entregar la lámina para el corte", await call("POST", `/factory/orders/${ov.data.id}/pieces`, { piece_id: hojas.data[1].id, plan_id: lineaCorte.id }));
  eq("una lámina de 1,22 × 2,44 rinde 6 cortes de 0,4 × 0,6", ent.cuts_covered, 6);
  eq("no falta ninguno", ent.cuts_remaining, 0);
  no("entregar de más para un corte cubierto", await call("POST", `/factory/orders/${ov.data.id}/pieces`, { piece_id: hojas.data[0].id, plan_id: lineaCorte.id }), 400);
  const ovp2 = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("la receta muestra el corte cubierto", ovp2.plan.lines.find(l => l.id === lineaCorte.id).cuts_missing, 0);
  ok("devolverla sin cortar libera el corte", await call("DELETE", `/factory/orders/${ov.data.id}/pieces/${ovp2.uses.find(u => u.cuts.some(c => c.plan_id === lineaCorte.id)).id}`));
  const ovp3 = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("el corte vuelve a faltar", ovp3.plan.lines.find(l => l.id === lineaCorte.id).cuts_missing, 6);

  // ── Una lámina para varios cortes de la misma orden: el cuerpo y las puertas ──────────
  const lamG = ok("material para el gabinete", await call("POST", "/factory/materials", {
    name: `QA Lámina gabinete ${Date.now()}`, piece_mode: "area", piece_width_mm: 1220, piece_length_mm: 2440,
  }));
  const tubG = ok("tubo para el gabinete", await call("POST", "/factory/materials", {
    name: `QA Tubo gabinete ${Date.now()}`, piece_mode: "length", piece_length_mm: 6000,
  }));
  creados.products.push(lamG.data.id, tubG.data.id);
  const hojasG = ok("2 láminas del gabinete", await call("POST", "/factory/pieces", {
    product_id: lamG.data.id, warehouse_id: WH, origin: "carga_inicial", count: 2, width_mm: 1220, length_mm: 2440, cost_per_piece: 100,
  }));
  const tubosG = ok("1 tubo del gabinete", await call("POST", "/factory/pieces", {
    product_id: tubG.data.id, warehouse_id: WH, origin: "carga_inicial", count: 1, length_mm: 6000, cost_per_piece: 30,
  }));
  const fdg = new FormData();
  fdg.append("name", `QA Gabinete ${Date.now()}`); fdg.append("price", "300"); fdg.append("unit", "UNIDAD");
  const gab = ok("producto gabinete", await call("POST", "/products", fdg));
  creados.products.push(gab.data.id);
  ok("receta con cuatro cortes", await call("PUT", `/factory/recipes/${gab.data.id}`, {
    unit: "m",
    items: [
      { component_id: lamG.data.id, width_expr: "1,2", length_expr: "1,4", cuts_expr: "1" },   // cuerpo: 2 en total
      { component_id: lamG.data.id, width_expr: "0,5", length_expr: "0,6", cuts_expr: "3" },   // puertas: 6
      { component_id: lamG.data.id, width_expr: "1", length_expr: "1", cuts_expr: "1" },       // fondo: 2
      { component_id: tubG.data.id, length_expr: "0,85", cuts_expr: "2" },                     // patas: 4
      { component_id: tubG.data.id, length_expr: "1", cuts_expr: "2" },                        // travesaños: 4
    ],
  }));
  const og = ok("orden de 2 gabinetes", await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: gab.data.id, quantity: 2,
  }));
  const og2 = ok("otra orden de gabinetes", await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: gab.data.id, quantity: 1,
  }));
  creados.orders.push(og.data.id, og2.data.id);
  const ogd = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const [cuerpo, puertas, fondo, patas, travesanos] = ogd.plan.lines.filter(l => l.kind === "material");
  const [s1, s2] = hojasG.data;
  const entregar = (piece, line, order = og) => call("POST", `/factory/orders/${order.data.id}/pieces`, { piece_id: piece.id, plan_id: line.id });

  const c1 = ok("lámina 1 para un cuerpo", await entregar(s1, cuerpo));
  eq("cubre 1 cuerpo", c1.cuts_covered, 1);
  eq("es una entrega nueva", c1.added, false);
  const c2 = ok("la misma lámina también para las puertas", await entregar(s1, puertas));
  eq("no se entrega de nuevo: se le suma el corte", c2.added, true);
  eq("con el área que le queda salen 4 puertas", c2.cuts_covered, 4);
  eq("faltan 2 puertas", c2.cuts_remaining, 2);
  no("el mismo corte otra vez con la misma lámina", await entregar(s1, puertas), 400);
  no("el cuerpo otra vez con la misma lámina", await entregar(s1, cuerpo), 400);
  no("un corte que ya no le cabe", await entregar(s1, fondo), 400);
  no("entrega libre de una lámina que ya está en esta orden",
    await call("POST", `/factory/orders/${og.data.id}/pieces`, { piece_id: s1.id }), 400);
  const og2d = (await call("GET", `/factory/orders/${og2.data.id}`)).data;
  no("la lámina en el taller de otra orden", await entregar(s1, og2d.plan.lines.find(l => l.kind === "material"), og2), 400);
  ok("lámina 2 para el otro cuerpo", await entregar(s2, cuerpo));
  const c3 = ok("lámina 2 para las puertas que faltan", await entregar(s2, puertas));
  eq("solo cubre las 2 que faltan", c3.cuts_covered, 2);
  no("a la lámina 2 tampoco le cabe el fondo", await entregar(s2, fondo), 400);
  const t1 = ok("tubo para las patas", await entregar(tubosG.data[0], patas));
  eq("4 patas de 0,85", t1.cuts_covered, 4);
  const t2 = ok("el mismo tubo para los travesaños", await entregar(tubosG.data[0], travesanos));
  eq("con los 2,60 m que quedan salen 2 de 1 m", t2.cuts_covered, 2);

  let ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const lp = ogv.plan.lines.find(l => l.id === puertas.id);
  eq("las puertas quedan cubiertas", lp.cuts_missing, 0);
  eq("con dos láminas", lp.pieces.map(p => `${p.code}:${p.cuts}`).join(" "), `${s1.code}:4 ${s2.code}:2`);
  const useS1 = ogv.uses.find(u => u.piece_id === s1.id);
  eq("la lámina 1 cubre dos cortes", useS1.cuts.length, 2);
  eq("y está entregada una sola vez", ogv.uses.filter(u => u.piece_id === s1.id).length, 1);
  ok("devolver la lámina 1 sin cortar", await call("DELETE", `/factory/orders/${og.data.id}/pieces/${useS1.id}`));
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  eq("su cuerpo vuelve a faltar", ogv.plan.lines.find(l => l.id === cuerpo.id).cuts_missing, 1);
  eq("y sus puertas también", ogv.plan.lines.find(l => l.id === puertas.id).cuts_missing, 4);

  // ── Dibujo del corte al devolver: los retazos salen de las zonas ──────────────────────
  const useS2 = ogv.uses.find(u => u.piece_id === s2.id);
  const devolver = (use, body) => call("POST", `/factory/orders/${og.data.id}/pieces/${use.id}/return`, body);
  const usado = (x, dx, y = 0, dy = 1220) => ({ x, y, dx, dy, kind: "usado" });
  const retazo = (x, dx, y = 0, dy = 1220) => ({ x, y, dx, dy, kind: "retazo" });
  no("zona que se sale de la lámina", await devolver(useS2, { layout: { regions: [usado(0, 1400), retazo(1400, 1100)] } }), 400);
  no("zonas encimadas", await devolver(useS2, { layout: { regions: [usado(0, 1400), retazo(1300, 1140)] } }), 400);
  no("zona de un tipo que no existe", await devolver(useS2, { layout: { regions: [{ ...usado(0, 1400), kind: "otro" }] } }), 400);
  no("medidas con decimales", await devolver(useS2, { layout: { regions: [usado(0, 1400.5)] } }), 400);
  no("dibujo vacío", await devolver(useS2, { layout: { regions: [] } }), 400);
  no("todo vuelve como retazo: no se consumió nada", await devolver(useS2, { layout: { regions: [retazo(0, 2440)] } }), 400);
  const dib = ok("devolver con el dibujo", await devolver(useS2, {
    layout: { regions: [usado(0, 1400), retazo(1400, 1040, 0, 700), retazo(1400, 1040, 700, 520)] },
    remnants: [{ width_mm: 10, length_mm: 10 }],   // con dibujo esto se ignora
  }));
  eq("consumido = lámina − los dos retazos del dibujo", dib.consumed, 1.708);
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const vueltaS2 = ogv.uses.find(u => u.id === useS2.id);
  eq("salen los retazos de las zonas", vueltaS2.remnants.map(r => `${r.width_mm}x${r.length_mm}`).join(" "), "700x1040 520x1040");
  eq("el dibujo queda con el número de cada retazo",
    vueltaS2.layout.regions.filter(r => r.kind === "retazo").map(r => r.code).join(" "), `${s2.code}-1 ${s2.code}-2`);
  const histS2 = (await call("GET", `/factory/pieces/${s2.id}`)).data;
  eq("el historial de la lámina trae el dibujo", histS2.tree.find(t => t.id === s2.id && t.use_layout)?.use_layout.regions.length, 3);
  ok("deshacer la devolución dibujada", await call("POST", `/factory/orders/${og.data.id}/pieces/${useS2.id}/undo`));
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  eq("al deshacer se borra el dibujo", ogv.uses.find(u => u.id === useS2.id).layout, null);
  const useT = ogv.uses.find(u => u.piece_id === tubosG.data[0].id);
  const tub = ok("tubo devuelto con dibujo", await devolver(useT, {
    layout: { regions: [{ x: 0, dx: 3400, kind: "usado" }, { x: 3400, dx: 2600, kind: "retazo" }] },
  }));
  eq("del tubo se consumen 3,4 m", tub.consumed, 3.4);
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  eq("y vuelve un tramo de 2,6 m", ogv.uses.find(u => u.id === useT.id).remnants[0]?.length_mm, 2600);

  // ── Retazos unidos: dos pedazos que se tocan son una sola pieza (en L) ───────────────
  // La lámina de 1,22 × 2,44 con una esquina de 0,63 × 0,57 usada: lo que queda es UNA L.
  ok("lámina 1 a la orden otra vez", await call("POST", `/factory/orders/${og.data.id}/pieces`, { piece_id: s1.id }));
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const useL = ogv.uses.find(u => u.piece_id === s1.id && !u.returned_at);
  const z = (kind, x, dx, y, dy, group) => ({ kind, x, dx, y, dy, ...(group ? { group } : {}) });
  no("unir pedazos que no se tocan", await devolver(useL, { layout: { regions: [z("retazo", 0, 500, 0, 500, 1), z("retazo", 1000, 500, 0, 500, 1)] } }), 400);
  no("unir un pedazo usado", await devolver(useL, { layout: { regions: [z("usado", 0, 500, 0, 500, 1), z("retazo", 500, 500, 0, 500, 1)] } }), 400);
  const enL = ok("devolver con dos retazos unidos en L", await devolver(useL, { layout: { regions: [
    z("retazo", 0, 1870, 0, 1220, 1), z("usado", 1870, 570, 0, 630), z("retazo", 1870, 570, 630, 590, 1),
  ] } }));
  eq("se consume solo la esquina", enL.consumed, 0.359);
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const remsL = ogv.uses.find(u => u.id === useL.id).remnants;
  eq("vuelve UN retazo", remsL.length, 1);
  const pL = remsL[0];
  eq("irregular, con su contorno", `${pL.is_irregular} ${pL.width_mm}x${pL.length_mm}`, "true 1220x2440");
  eq("y su forma en dos partes", pL.shape?.length, 2);
  eq("del área de la L", pL.size, 2.618);
  eq("las dos zonas llevan el mismo número",
    [...new Set(ogv.uses.find(u => u.id === useL.id).layout.regions.filter(r => r.kind === "retazo").map(r => r.code))].join(" "), pL.code);
  const cabe = async (w, l) => ((await call("GET", `/factory/pieces?product_id=${lamG.data.id}&status=disponible&fit_w=${w}&fit_l=${l}`)).data || []).some(x => x.id === pL.id);
  eq("un corte que cabe en la parte grande la encuentra", await cabe(1000, 1800), true);
  eq("uno de 1,22 × 2,0 no, aunque el área alcance", await cabe(1220, 2000), false);
  const enLc = ok("la L para el fondo del gabinete", await entregar(pL, fondo));
  eq("rinde 1 fondo de 1 × 1 (solo cabe en la parte grande)", enLc.cuts_covered, 1);
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const useL2 = ogv.uses.find(u => u.piece_id === pL.id);
  no("dibujar donde la L no tiene material", await devolver(useL2, { layout: { regions: [z("usado", 1870, 570, 0, 630)] } }), 400);
  const recta = ok("unir dos pedazos que forman un rectángulo", await devolver(useL2, { layout: { regions: [
    z("usado", 0, 1000, 0, 1220), z("retazo", 1000, 870, 0, 600, 2), z("retazo", 1000, 870, 600, 620, 2),
  ] } }));
  eq("lo consumido es la L menos el rectángulo", recta.consumed, 1.557);
  ogv = (await call("GET", `/factory/orders/${og.data.id}`)).data;
  const rRecta = ogv.uses.find(u => u.id === useL2.id).remnants;
  eq("queda un retazo normal de 1,22 × 0,87", rRecta.map(r => `${r.is_irregular} ${r.width_mm}x${r.length_mm}`).join(" "), "false 1220x870");

  ok("pasar a Corte", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: corte.id }));
  no("pasar a la misma etapa", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: corte.id }), 400);
  no("etapa inexistente", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: 999999 }), 404);
  no("minutos negativos", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: soldadura.id, minutes: -5 }), 400);
  no("desactivar una etapa con órdenes", await call("PUT", `/factory/stages/${corte.id}`, { name: "Corte", cost_per_hour: 6, active: false }), 400);
  ok("pasar a Soldadura con 35 min de corte", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: soldadura.id, minutes: 35, worker: "Luis" }));
  ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("mano de obra de corte (35 min a 6/h)", ovd.labor_cost, 3.5);
  eq("la orden está en Soldadura", ovd.current_stage?.name, "Soldadura");
  no("borrar una etapa usada", await call("DELETE", `/factory/stages/${corte.id}`), 400);

  ok("entregar la lámina del vaso", await call("POST", `/factory/orders/${ov.data.id}/pieces`, { piece_id: hojas.data[0].id }));
  ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  ok("devolver con un retazo", await call("POST", `/factory/orders/${ov.data.id}/pieces/${ovd.uses[0].id}/return`, {
    remnants: [{ width_mm: 1220, length_mm: 1129 }],
  }));
  ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  const cm = ovd.plan.by_component.find(c => c.kind === "material");
  eq("consumo real del material", cm.actual, 1.6);
  eq("merma contra la receta", cm.diff, 0.16);
  eq("merma en porcentaje", cm.diff_pct, 11.1);
  eq("corte: debía 30 min, tomó 35", ovd.plan.by_component.find(c => c.stage_id === corte.id).actual, 35);

  const fin = ok("terminar con 50 min de soldadura", await call("POST", `/factory/orders/${ov.data.id}/finish`, { minutes: 50 }));
  eq("accesorios descontados solos", fin.auto_accessories?.[0]?.quantity, 6);
  ovd = (await call("GET", `/factory/orders/${ov.data.id}`)).data;
  eq("mano de obra total (3,50 + 7,50)", ovd.labor_cost, 11);
  eq("costo total = material + accesorios + mano de obra",
    ovd.total_cost, Math.round((ovd.material_cost + ovd.accessories_cost + 11) * 10000) / 10000);
  eq("terminada sale del tablero", ovd.current_stage, null);
  no("mover una orden terminada", await call("POST", `/factory/orders/${ov.data.id}/stage`, { stage_id: corte.id }), 400);
  no("borrar un producto con receta", await call("DELETE", `/products/${vaso.data.id}`), 400);
  ok("listar recetas", await call("GET", "/factory/recipes"));
  ok("borrar receta", await call("DELETE", `/factory/recipes/${vaso.data.id}`));
  no("receta borrada", await call("GET", `/factory/recipes/${vaso.data.id}`), 404);
  const lista = await call("GET", "/factory/orders?status=abierta");
  eq("el tablero lista responsable", lista.data.find(o => o.id === om.data.id)?.assignee, "Pedro");

  // ── Concurrencia ──────────────────────────────────────────────────────────────────────
  // Dos órdenes piden la misma pieza a la vez: solo una se la lleva.
  const ca = ok("orden A", await call("POST", "/factory/orders", { warehouse_id: WH, description: "QA concurrencia A" }));
  const cb = ok("orden B", await call("POST", "/factory/orders", { warehouse_id: WH, description: "QA concurrencia B" }));
  creados.orders.push(ca.data.id, cb.data.id);
  const libre = carga.data[1];
  const dobles = await Promise.all([
    call("POST", `/factory/orders/${ca.data.id}/pieces`, { piece_id: libre.id }),
    call("POST", `/factory/orders/${cb.data.id}/pieces`, { piece_id: libre.id }),
  ]);
  eq("la misma pieza en dos órdenes a la vez: solo una", dobles.filter(r => r.ok).length, 1);
  // Tres altas simultáneas no repiten número.
  const altas = await Promise.all([1, 2, 3].map(() => call("POST", "/factory/pieces", {
    product_id: tubo.data.id, warehouse_id: WH, origin: "carga_inicial", count: 2, length_mm: 3000, cost_per_piece: 15,
  })));
  const codigos = altas.flatMap(r => (r.data || []).map(p => p.code));
  eq("altas simultáneas: 6 piezas", codigos.length, 6);
  eq("sin números repetidos", new Set(codigos).size, 6);

  // ── Carga inicial con número propio: la #51 del Excel sigue siendo la #51 ─────────────
  const tope = (await call("GET", "/factory/pieces?status=todas&limit=1")).data?.[0]?.root_number || 0;
  const propio = tope + 100;
  const tubo6 = { product_id: tubo.data.id, warehouse_id: WH, origin: "carga_inicial", length_mm: 6000, cost_per_piece: 30 };
  const conNumero = ok("carga inicial con su número", await call("POST", "/factory/pieces", { ...tubo6, count: 2, first_number: propio }));
  eq("primera con el número pedido", conNumero.data?.[0]?.code, String(propio));
  eq("segunda con el que sigue", conNumero.data?.[1]?.code, String(propio + 1));
  const siguiente = ok("carga sin número después", await call("POST", "/factory/pieces", { ...tubo6, count: 1 }));
  eq("lo siguiente va tras el más alto", siguiente.data?.[0]?.code, String(propio + 2));
  no("número que ya existe", await call("POST", "/factory/pieces", { ...tubo6, count: 1, first_number: propio }), 400);
  no("rango que pisa un número usado", await call("POST", "/factory/pieces", { ...tubo6, count: 3, first_number: propio - 2 }), 400);
  ok("hueco libre debajo se puede cargar", await call("POST", "/factory/pieces", { ...tubo6, count: 1, first_number: propio - 1 }));
  no("número propio en existencia sin número", await call("POST", "/factory/pieces", { ...tubo6, origin: "existencia", count: 1, first_number: propio + 50 }), 400);
  no("número propio cero", await call("POST", "/factory/pieces", { ...tubo6, count: 1, first_number: 0 }), 400);
  no("número propio con decimales", await call("POST", "/factory/pieces", { ...tubo6, count: 1, first_number: 51.5 }), 400);
  no("número propio que no es número", await call("POST", "/factory/pieces", { ...tubo6, count: 1, first_number: "51a" }), 400);

  // ── Kardex: la fabricación se ve en Movimientos ───────────────────────────────────────
  const k = await call("GET", `/warehouses/movements?product_id=${pid}&warehouse_id=${WH}`);
  ok("kardex del material", k);
  const filas = (k.data?.rows || []).filter(x => x.kind === "fabricacion");
  eq("consumo con su orden como documento", filas.some(x => x.doc === o1.data.code), true);

  console.log(`\n${pasos - fallos}/${pasos} pruebas pasaron`);
  console.log("CREADOS", JSON.stringify(creados));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR", e); process.exit(1); });
