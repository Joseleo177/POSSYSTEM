/**
 * Carga de demostración del módulo Fábrica: un taller de acero inoxidable que viene de llevar
 * sus láminas en Excel. El hilo de la demo es la lámina #51, contada como la cuenta el cliente:
 *
 *   #51       lámina entera del Excel. Con ella se fabrica un fregadero y queda casi la mitad.
 *   #51-1     ese pedazo, una semana después, da para 3 repisas. Queda una tira.
 *   #51-1-1   la tira espera la orden de servilleteros: esa entrega se hace en vivo, y con ella
 *             de la lámina ya no queda nada.
 *
 * Alrededor: la carga inicial con los números del Excel (#45 a #52, y la #38 a medio usar),
 * una compra que sigue la numeración desde la #53, 6 productos con receta, la orden de
 * gabinetes ya fabricada y un mesón a medida en el tablero.
 *
 * Todo entra por la API, con las mismas validaciones que la pantalla. Correrlo en una empresa
 * NUEVA con el módulo Fábrica encendido (la numeración tiene que estar libre):
 *
 *   docker cp backend/src/scripts/seed-fabrica-demo.js pos_backend:/tmp/ && \
 *   docker exec -e TOKEN=<token de un admin> -e WH=<id del almacén> pos_backend node /tmp/seed-fabrica-demo.js
 *
 * Las fechas quedan en el día en que se corre; seed-fabrica-demo-fechas.sql las reparte en
 * las últimas semanas para que la historia se lea en orden.
 */
const API = process.env.API || "http://localhost:4000/api";
const TOKEN = process.env.TOKEN;
const WH = parseInt(process.env.WH || "1", 10);
if (!TOKEN) { console.error("Falta TOKEN"); process.exit(1); }

async function call(method, path, body) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(API + path, { method, headers, body: payload });
  const j = await r.json().catch(() => ({}));
  if (!j.ok && !Array.isArray(j)) throw new Error(`${method} ${path}: ${j.message || r.status}`);
  return j;
}

async function product(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, String(v));
  return (await call("POST", "/products", fd)).data;
}

(async () => {
  // ── Categorías ─────────────────────────────────────────────────────────────────────────
  const cat = async (name, color) => (await call("POST", "/categories", { name, color })).data;
  const catVenta = await cat("Productos fabricados", "#0ea5e9");
  const catMat = await cat("Láminas y tubos", "#64748b");
  const catIns = await cat("Insumos", "#a16207");

  // ── Materiales con control por piezas ─────────────────────────────────────────────────
  const lam304 = await product({ name: "Lámina inox 304 cal. 18 brillante", price: 0, sellable: false, category_id: catMat.id, piece_mode: "area", piece_width_mm: 1220, piece_length_mm: 2440 });
  const lam430 = await product({ name: "Lámina inox 430 cal. 20 satinada", price: 0, sellable: false, category_id: catMat.id, piece_mode: "area", piece_width_mm: 1220, piece_length_mm: 2440 });
  const tubo = await product({ name: "Tubo inox 304 de 1\" × 1,2 mm", price: 0, sellable: false, category_id: catMat.id, piece_mode: "length", piece_length_mm: 6000 });
  console.log("materiales", lam304.id, lam430.id, tubo.id);

  // ── Insumos (accesorios) ──────────────────────────────────────────────────────────────
  const tornillo = await product({ category_id: catIns.id, name: "Tornillo inox 1/4\" × 1\"", price: 0, sellable: false, unit: "UNIDAD" });
  const bisagra = await product({ category_id: catIns.id, name: "Bisagra inox de 3\"", price: 0, sellable: false, unit: "UNIDAD" });
  const regaton = await product({ category_id: catIns.id, name: "Regatón de goma para tubo de 1\"", price: 0, sellable: false, unit: "UNIDAD" });
  const tirador = await product({ category_id: catIns.id, name: "Tirador inox de 128 mm", price: 0, sellable: false, unit: "UNIDAD" });
  const escuadra = await product({ category_id: catIns.id, name: "Escuadra inox para repisa de 8\"", price: 0, sellable: false, unit: "UNIDAD" });
  const varilla = await product({ category_id: catIns.id, name: "Varilla de soldadura TIG 308L", price: 0, sellable: false, unit: "KG", qty_step: 0.001 });
  console.log("insumos", tornillo.id, bisagra.id, regaton.id, tirador.id, escuadra.id, varilla.id);

  // ── Carga inicial: las láminas que venían numeradas en el Excel, con SU número ────────
  const carga = (fields) => call("POST", "/factory/pieces", { warehouse_id: WH, origin: "carga_inicial", reference: "Inventario del Excel", ...fields });
  await carga({ product_id: lam430.id, count: 3, first_number: 45, width_mm: 1220, length_mm: 2440, cost_per_piece: 115 });
  await carga({ product_id: lam304.id, count: 5, first_number: 48, width_mm: 1220, length_mm: 2440, cost_per_piece: 175 });
  // La #38 ya estaba picada en el Excel: entra con lo que le queda.
  await carga({ product_id: lam304.id, count: 1, first_number: 38, width_mm: 1220, length_mm: 1100, cost_per_piece: 79.12 });

  // ── Compras: lo nuevo se numera solo al recibirlo, siguiendo tras la #52 ──────────────
  const piezas = await call("POST", "/purchases", {
    warehouse_id: WH, status: "recibido", supplier_name: "Inoxidables Demo C.A.",
    notes: "Compra de demostración",
    items: [
      { product_id: lam304.id, package_qty: 4, package_price: 180, piece_width_mm: 1220, piece_length_mm: 2440 },
      { product_id: lam430.id, package_qty: 2, package_price: 120, piece_width_mm: 1220, piece_length_mm: 2440 },
      { product_id: tubo.id, package_qty: 6, package_price: 45, piece_length_mm: 6000 },
    ],
  });
  const insumos = await call("POST", "/purchases", {
    warehouse_id: WH, status: "recibido", supplier_name: "Ferretería Demo",
    notes: "Insumos de demostración",
    items: [
      { product_id: tornillo.id, package_unit: "CAJA", package_size: 100, package_qty: 5, package_price: 15 },
      { product_id: bisagra.id, package_unit: "UNIDAD", package_size: 1, package_qty: 60, package_price: 2.5 },
      { product_id: regaton.id, package_unit: "UNIDAD", package_size: 1, package_qty: 100, package_price: 0.4 },
      { product_id: tirador.id, package_unit: "UNIDAD", package_size: 1, package_qty: 40, package_price: 3.2 },
      { product_id: escuadra.id, package_unit: "UNIDAD", package_size: 1, package_qty: 50, package_price: 1.8 },
      { product_id: varilla.id, package_unit: "UNIDAD", package_size: 1, package_qty: 5, package_price: 18 },
    ],
  });
  console.log("compras", piezas.data.id, insumos.data.id);

  // ── Etapas del taller con su costo por hora ───────────────────────────────────────────
  let stages = (await call("GET", "/factory/stages")).data;
  if (!stages.length) stages = (await call("POST", "/factory/stages/presets")).data;
  const rate = { Corte: 6, Doblez: 6, Soldadura: 9, Pulido: 5, Empaque: 3 };
  for (const s of stages) {
    if (rate[s.name] != null) await call("PUT", `/factory/stages/${s.id}`, { name: s.name, cost_per_hour: rate[s.name] });
  }
  const st = Object.fromEntries(stages.map(s => [s.name, s.id]));
  const proc = (name, minutes) => (st[name] ? [{ stage_id: st[name], minutes_expr: minutes }] : []);

  // ── Productos de venta con su receta ──────────────────────────────────────────────────
  // Fregadero de una poza: estándar. Tope, poza y escurridor salen de un solo desarrollo.
  const fregadero = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Fregadero inox de 1 poza con escurridor 1,00 × 0,55 m", price: 380, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${fregadero.id}`, {
    unit: "cm",
    instructions: "Tope, poza de 50 × 40 × 25 cm y escurridor salen de un solo desarrollo de 122 × 140 cm. Escurridor con nervios marcados. Patas con regatón.",
    items: [
      { component_id: lam304.id, width_expr: "122", length_expr: "140", cuts_expr: "1" },
      { component_id: tubo.id, length_expr: "85", cuts_expr: "4" },
      { component_id: regaton.id, quantity_expr: "4" },
      { component_id: tornillo.id, quantity_expr: "6" },
      { component_id: varilla.id, quantity_expr: "0,08" },
      ...proc("Corte", "20"),
      ...proc("Doblez", "25"),
      ...proc("Soldadura", "45"),
      ...proc("Pulido", "35"),
      ...proc("Empaque", "10"),
    ],
  });

  // Repisa de pared: a medida (largo y fondo). Pestaña de 4 cm por lado.
  const repisa = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Repisa de pared inox a medida", price: 60, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${repisa.id}`, {
    unit: "cm",
    params: [
      { key: "L", label: "Largo", kind: "medida", default: 90 },
      { key: "F", label: "Fondo", kind: "medida", default: 25 },
    ],
    instructions: "Pestaña de 4 cm doblada en los cuatro lados. Dos escuadras por repisa, atornilladas.",
    items: [
      { component_id: lam304.id, width_expr: "F + 8", length_expr: "L + 8", cuts_expr: "1" },
      { component_id: escuadra.id, quantity_expr: "2" },
      { component_id: tornillo.id, quantity_expr: "4" },
      ...proc("Corte", "5 + L * 0,05"),
      ...proc("Doblez", "10"),
      ...proc("Pulido", "8 + L * 0,05"),
    ],
  });

  // Servilletero de mesa: estándar, una pieza doblada en U.
  const servilletero = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Servilletero inox de mesa", price: 25, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${servilletero.id}`, {
    unit: "cm",
    instructions: "Una pieza de 20 × 32 cm doblada en U, bordes pulidos.",
    items: [
      { component_id: lam304.id, width_expr: "20", length_expr: "32", cuts_expr: "1" },
      ...proc("Corte", "5"),
      ...proc("Doblez", "8"),
      ...proc("Pulido", "6"),
    ],
  });

  // Mesón de trabajo: a medida (largo, ancho, alto).
  const meson = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Mesón de trabajo inox con entrepaño", price: 450, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${meson.id}`, {
    unit: "cm",
    params: [
      { key: "L", label: "Largo", kind: "medida", default: 180 },
      { key: "A", label: "Ancho", kind: "medida", default: 60 },
      { key: "H", label: "Alto", kind: "medida", default: 90 },
    ],
    instructions: "Tope en 304 con pestaña de 5 cm doblada hacia abajo. Entrepaño en 430. Patas soldadas al tope, travesaños a 20 cm del piso. Pulir uniones.",
    items: [
      { component_id: lam304.id, width_expr: "A + 10", length_expr: "L + 10", cuts_expr: "1" },
      { component_id: lam430.id, width_expr: "A - 5", length_expr: "L - 5", cuts_expr: "1" },
      { component_id: tubo.id, length_expr: "H - 4", cuts_expr: "4" },
      { component_id: tubo.id, length_expr: "L - 10", cuts_expr: "2" },
      { component_id: tubo.id, length_expr: "A - 10", cuts_expr: "2" },
      { component_id: regaton.id, quantity_expr: "4" },
      { component_id: tornillo.id, quantity_expr: "8" },
      { component_id: varilla.id, quantity_expr: "0,0005 * (L + A)" },
      ...proc("Corte", "15 + L * 0,05"),
      ...proc("Doblez", "20"),
      ...proc("Soldadura", "30 + L * 0,15"),
      ...proc("Pulido", "25 + L * 0,1"),
    ],
  });

  // Campana extractora: a medida (ancho y fondo).
  const campana = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Campana extractora inox a medida", price: 290, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${campana.id}`, {
    unit: "cm",
    params: [
      { key: "A", label: "Ancho", kind: "medida", default: 90 },
      { key: "F", label: "Fondo", kind: "medida", default: 60 },
    ],
    instructions: "Cuerpo piramidal en 430, ducto de salida de 25 × 25 cm. Filtro removible con tornillos.",
    items: [
      { component_id: lam430.id, width_expr: "F + 40", length_expr: "A + 20", cuts_expr: "1" },
      { component_id: lam430.id, width_expr: "30", length_expr: "100", cuts_expr: "1" },
      { component_id: tornillo.id, quantity_expr: "10" },
      { component_id: varilla.id, quantity_expr: "0,0003 * (A + F)" },
      ...proc("Corte", "15"),
      ...proc("Doblez", "20 + A * 0,15"),
      ...proc("Soldadura", "25"),
      ...proc("Pulido", "20"),
    ],
  });

  // Gabinete aéreo con puertas: estándar, con número de puertas como variable.
  const gabinete = await product({ category_id: catVenta.id, warehouse_id: WH, name: "Gabinete aéreo inox con puertas batientes", price: 320, unit: "UNIDAD" });
  await call("PUT", `/factory/recipes/${gabinete.id}`, {
    unit: "cm",
    params: [{ key: "P", label: "Puertas", kind: "numero", default: 2 }],
    instructions: "Cuerpo de 100 × 60 × 35 cm en 430 con una repisa interna. Puertas con tirador y dos bisagras cada una.",
    items: [
      { component_id: lam430.id, width_expr: "120", length_expr: "140", cuts_expr: "1" },
      { component_id: lam430.id, width_expr: "100 / P", length_expr: "60", cuts_expr: "P" },
      { component_id: bisagra.id, quantity_expr: "P * 2" },
      { component_id: tirador.id, quantity_expr: "P" },
      { component_id: tornillo.id, quantity_expr: "12 + P * 4" },
      ...proc("Corte", "20"),
      ...proc("Doblez", "40"),
      ...proc("Soldadura", "20"),
      ...proc("Pulido", "25"),
      ...proc("Empaque", "10"),
    ],
  });
  console.log("productos", fregadero.id, repisa.id, servilletero.id, meson.id, campana.id, gabinete.id);

  // ── Clientes ──────────────────────────────────────────────────────────────────────────
  const cliente = async (name, rif) => (await call("POST", "/customers", { name, rif, type: "cliente" })).data;
  const esquina = await cliente("Restaurante La Esquina", "J-99999901-0");
  const trigal = await cliente("Panadería El Trigal", "J-99999902-0");
  const aroma = await cliente("Café Aroma", "J-99999903-0");

  const series = (await call("GET", "/series")).data || [];
  const serie = series.find(s => s.type === "factura" && s.active !== false);

  // ── Ayudantes para fabricar una orden de punta a punta ────────────────────────────────
  const pieceByCode = async (code) => (await call("GET", `/factory/pieces?status=todas&search=${encodeURIComponent(code)}`)).data
    .find(p => p.code === code);
  const planLine = (order, componentId, n = 0) => order.plan.lines.filter(l => l.kind === "material" && l.component_id === componentId)[n];
  // Entrega la pieza para un corte de la receta, como el botón Entregar de la orden.
  const deliver = async (orderId, code, componentId, n = 0) => {
    const o = (await call("GET", `/factory/orders/${orderId}`)).data;
    const piece = await pieceByCode(code);
    await call("POST", `/factory/orders/${orderId}/pieces`, { piece_id: piece.id, plan_id: planLine(o, componentId, n).id });
  };
  // Devuelve con los retazos escritos, o con el dibujo de cómo se picó ({ regions }).
  const giveBack = async (orderId, code, remnants, note) => {
    const o = (await call("GET", `/factory/orders/${orderId}`)).data;
    const use = o.uses.find(u => u.code === code && !u.returned_at);
    const body = Array.isArray(remnants) ? { remnants, note } : { layout: remnants, note };
    await call("POST", `/factory/orders/${orderId}/pieces/${use.id}/return`, body);
  };
  // Zonas del dibujo en mm: x a lo largo de la pieza, y a lo ancho.
  const zona = (kind, x, dx, y = 0, dy = 0) => ({ kind, x, dx, y, dy });
  // Pasa por las etapas con los minutos que tomó cada una, y termina.
  const fabricate = async (orderId, tiempos, worker) => {
    const nombres = Object.keys(tiempos).filter(n => st[n]);
    for (let i = 0; i < nombres.length; i++) {
      const prev = nombres[i - 1];
      await call("POST", `/factory/orders/${orderId}/stage`, {
        stage_id: st[nombres[i]], ...(prev ? { minutes: tiempos[prev], worker } : {}),
      });
    }
    await call("POST", `/factory/orders/${orderId}/finish`, { minutes: tiempos[nombres[nombres.length - 1]], worker });
  };
  const invoice = async (orderId, price) => {
    if (serie) await call("POST", `/factory/orders/${orderId}/invoice`, { serie_id: serie.id, sale_price: price });
  };

  // ── OF-0001 · Fregadero para Restaurante La Esquina: sale de la #51 ───────────────────
  const of1 = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "cliente", product_id: fregadero.id, quantity: 1,
    customer_id: esquina.id, sale_price: 380, assignee: "Carlos",
  })).data;
  await deliver(of1.id, "51", lam304.id);
  const tubos = (await call("GET", `/factory/pieces?product_id=${tubo.id}&status=disponible`)).data
    .sort((a, b) => a.root_number - b.root_number);
  await deliver(of1.id, tubos[0].code, tubo.id);
  await giveBack(of1.id, "51", { regions: [zona("usado", 0, 1400, 0, 1220), zona("retazo", 1400, 1040, 0, 1220)] },
    "Se fabricó el fregadero de 1 poza (desarrollo de 122 × 140 cm). Quedó casi la mitad de la lámina: 1,22 × 1,04 m");
  await giveBack(of1.id, tubos[0].code, { regions: [zona("usado", 0, 3400), zona("retazo", 3400, 2600)] }, "4 patas de 85 cm; quedan 2,60 m de tubo");
  await fabricate(of1.id, { Corte: 25, Doblez: 30, Soldadura: 50, Pulido: 35, Empaque: 10 }, "Carlos");
  await invoice(of1.id, 380);

  // ── OF-0002 · 3 repisas para Panadería El Trigal: salen del pedazo #51-1 ──────────────
  const of2 = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "medida", destination: "cliente", product_id: repisa.id, quantity: 3,
    customer_id: trigal.id, sale_price: 180, params: { L: 90, F: 25 },
    description: "3 repisas de 0,90 × 0,25 m para el área de hornos", assignee: "Luis",
  })).data;
  await deliver(of2.id, "51-1", lam304.id);
  // Las 3 repisas de 0,33 × 0,98 a lo largo del pedazo; abajo queda la tira y al costado un sobrante.
  await giveBack(of2.id, "51-1", { regions: [
    zona("usado", 0, 980, 0, 330), zona("usado", 0, 980, 330, 330), zona("usado", 0, 980, 660, 330),
    zona("usado", 980, 60, 0, 990), zona("retazo", 0, 1040, 990, 230),
  ] },
    "Salieron las 3 repisas (cortes de 0,33 × 0,98 m). Queda una tira de 0,23 × 1,04 m");
  await fabricate(of2.id, { Corte: 20, Doblez: 30, Pulido: 25 }, "Luis");
  await invoice(of2.id, 180);

  // ── OF-0003 · 2 gabinetes al inventario, de las #45 y #46 ─────────────────────────────
  // De la #45 salen a la vez un cuerpo y las 4 puertas; la #46 da el otro cuerpo.
  const og = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: gabinete.id, quantity: 2, assignee: "Luis",
  })).data;
  await deliver(og.id, "45", lam430.id, 0);
  await deliver(og.id, "45", lam430.id, 1);
  await deliver(og.id, "46", lam430.id, 0);
  await giveBack(og.id, "45", [], "Un cuerpo y las 4 puertas; sobraron tiras que no sirven");
  await giveBack(og.id, "46", { regions: [zona("usado", 0, 1400, 0, 1220), zona("retazo", 1400, 1040, 0, 1220)] }, "Cuerpo del segundo gabinete; queda 1,22 × 1,04 m");
  await fabricate(og.id, { Corte: 40, Doblez: 85, Soldadura: 45, Pulido: 50, Empaque: 20 }, "Luis");

  // ── OF-0004 · Mesón a medida en el tablero, en Corte ──────────────────────────────────
  const due = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const of4 = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "medida", destination: "cliente", product_id: meson.id, quantity: 2,
    customer_id: esquina.id, sale_price: 980, params: { L: 200, A: 70, H: 90 },
    description: "Mesón de trabajo 2,00 × 0,70 m para cocina", due_date: due(6), assignee: "Carlos",
  })).data;
  if (st.Corte) await call("POST", `/factory/orders/${of4.id}/stage`, { stage_id: st.Corte });

  // ── OF-0005 · 3 servilleteros para Café Aroma: esperan el material ────────────────────
  // Se deja sin entregar: en la demo, Entregar sugiere la #51-1-1 primero y alcanza justo.
  const of5 = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "cliente", product_id: servilletero.id, quantity: 3,
    customer_id: aroma.id, sale_price: 75, due_date: due(4), assignee: "Luis",
  })).data;

  // ── OF-0006 · 3 fregaderos para tener en existencia ───────────────────────────────────
  const of6 = (await call("POST", "/factory/orders", {
    warehouse_id: WH, type: "estandar", destination: "stock", product_id: fregadero.id, quantity: 3, assignee: "Carlos",
  })).data;

  console.log("órdenes", of1.code, of2.code, og.code, of4.code, of5.code, of6.code);
  console.log("listo");
})().catch(e => { console.error("ERROR", e.message); process.exit(1); });
