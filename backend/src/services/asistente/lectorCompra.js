'use strict';

// Compra desde foto (Asta, 23-11-2026). Lee la foto del documento de un proveedor (factura, nota
// u orden de entrega, ticket de máquina fiscal) y devuelve una PROPUESTA: proveedor, datos del
// documento y líneas cruzadas con el catálogo. No guarda ninguna compra: la pantalla la muestra
// para revisar y la pasa al formulario de compra, donde se guarda como borrador como siempre.
//
// Probado con documentos reales de proveedores (ver memoria del proyecto): con la foto derecha
// lee bien las líneas y los totales; girada se enreda. Por eso la pantalla obliga a enderezarla
// antes de enviar, y aquí se revisa que las líneas sumen lo que dice el papel.
//
// La foto no se guarda en ningún lado: va a DeepSeek y se descarta.

const { sequelize, Sequelize } = require("../../models");
const deepseek = require("./deepseek");
const asistente = require("./index");
const { visibleWarehouseIds } = require("../../middleware/auth");
const { condicionSucursal } = require("../products/productAccess");

const PESO = 5;                 // consultas del cupo que gasta cada lectura
const MAX_FOTOS = 4;
const MAX_BYTES_FOTO = 3_500_000;
const MODELO_VISION = process.env.DEEPSEEK_MODELO_VISION || "deepseek-flash";
const ESPERA_MS = 110_000;      // un documento largo tarda hasta ~60 s

const operacional = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const PROMPT = `Eres un lector de documentos de compra de comercios venezolanos. Las imágenes son fotos de UN documento de un PROVEEDOR: factura, nota de entrega, orden de entrega o ticket de máquina fiscal. Devuelve SOLO un JSON:
{"tipo":"factura|nota_entrega|orden_entrega|ticket_fiscal|otro",
 "emisor":{"nombre":"","rif":""},"cliente":{"nombre":"","rif":""},
 "documento":{"numero":"","numero_control":"","fecha":"YYYY-MM-DD","condicion":""},
 "moneda_lineas":"VES|USD","tasa":null,
 "lineas":[{"codigo":"","descripcion":"","cantidad":0,"unidad":"","unidades_por_empaque":null,"precio_unitario":null,"total":0,"exento":false}],
 "totales":{"subtotal":null,"exento":null,"base_imponible":null,"iva":null,"total":null,"total_usd":null},
 "dudas":[""]}
Reglas:
- Si la imagen no es un documento de compra, devuelve "tipo":"otro" y "lineas":[].
- IGNORA lo escrito a mano (porcentajes, rayas, cifras, firmas) y los sellos como "PAGADO". Solo lo impreso.
- El emisor es quien vende (cabecera del documento). "Razón social" o "Cliente" suele ser el comprador. Si el emisor no aparece en la foto, pon null; no uses los datos del cliente.
- Detecta el formato de números de cada documento: venezolano 1.102,52 (punto miles, coma decimal) o americano 161,154.28. Devuelve números JSON con punto decimal.
- Ticket fiscal: una línea "3 X Bs 1.861,88" encima de la descripción es cantidad 3 y precio unitario 1861.88; si una descripción no tiene esa línea, la cantidad es 1. "(E)" = exento.
- unidad: lo que dice la columna Unidad o el texto (CAJA, BULTO, DISPLAY, PAQUETE, UNIDAD, KG…). unidades_por_empaque: las piezas del empaque si la descripción lo dice ("12X300GR" = 12, "X12U" = 12, "X10" = 10, "24X170GR" = 24, "20X1KG" = 20); si no lo dice, null.
- moneda_lineas: la moneda de los precios de las líneas. tasa: la tasa Bs por dólar si está impresa.
- Si hay varias fotos, son partes del MISMO documento: las líneas que se repiten entre fotos van una sola vez.
- Si un dato no se lee con seguridad pon null y explícalo en "dudas" (frases cortas). No inventes nada.`;

// ── Números y textos ───────────────────────────────────────────────────────────

// El modelo devuelve números JSON, pero a veces cuela un texto con formato venezolano.
function num(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
const r2 = (n) => Math.round(n * 100) / 100;
const texto = (v, max = 200) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
};
const soloRif = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Clave con la que se recuerda una descripción del proveedor: mayúsculas, sin acentos ni signos.
function clave(desc) {
  return String(desc || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().slice(0, 200);
}

// Palabras para comparar nombres. "12X300GR" aporta "300G"; "X12U" y "(E)" no aportan nada.
const RUIDO = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "CON", "EN", "Y", "X", "E", "G", "C", "U", "UND", "UNID", "TAB", "CAJA", "BULTO", "DISPLAY", "PAQ", "PAQUETE"]);
function palabras(desc) {
  const s = String(desc || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/(\d+)\s*[X*]\s*(\d+(?:[.,]\d+)?)\s*(GRS?|G|KGS?|ML|LTS?|L|CC)\b/g, " $2$3 ")   // 12X300GR, 10*900GR → 300GR
    .replace(/\bX\s*\d+\s*[A-Z]?\b/g, " ")                                                // X12U, X10, X50U
    .replace(/(\d+(?:[.,]\d+)?)\s*(GRS?|GR|G)\b/g, "$1G")
    .replace(/(\d+(?:[.,]\d+)?)\s*(KGS?|KILOS?)\b/g, "$1KG")
    .replace(/(\d+(?:[.,]\d+)?)\s*(LTS?|LITROS?|L)\b/g, "$1L")
    .replace(/(\d+(?:[.,]\d+)?)\s*(MLS?|CC)\b/g, "$1ML")
    .replace(/,/g, ".");
  return [...new Set(s.split(/[^A-Z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, "")).filter(w => w.length >= 2 && !RUIDO.has(w) && !/^\d+$/.test(w)))];
}

// ── Lectura ────────────────────────────────────────────────────────────────────

function validarFotos(imagenes) {
  if (!Array.isArray(imagenes) || !imagenes.length) throw operacional("Agrega al menos una foto del documento.");
  if (imagenes.length > MAX_FOTOS) throw operacional(`Máximo ${MAX_FOTOS} fotos por documento.`);
  return imagenes.map((img) => {
    const s = String(img || "");
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) throw operacional("Una de las fotos no es una imagen válida.");
    if (s.length > MAX_BYTES_FOTO * 1.37) throw operacional("Una de las fotos es muy pesada. Tómala de nuevo o recórtala.");
    return { type: "image_url", image_url: { url: s } };
  });
}

async function preguntarAlModelo(fotos) {
  const r = await deepseek.completar({
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, ...fotos] }],
    opciones: {
      modelo: MODELO_VISION, espera_ms: ESPERA_MS, max_tokens: 16000, temperature: 0, json: true,
      msj_espera: "La lectura tardó demasiado. Prueba con una foto más nítida, o divide el documento en varias fotos.",
    },
  });
  let datos = null;
  // Cortado por largo = se enredó (casi siempre una foto girada o borrosa): no sirve a medias.
  if (r.fin !== "length") {
    try { datos = JSON.parse(String(r.mensaje.content || "").trim()); } catch { datos = null; }
  }
  return { datos, uso: r.uso };
}

function normalizar(d) {
  const lineas = (Array.isArray(d.lineas) ? d.lineas : []).map((l, i) => {
    const cantidad = num(l.cantidad);
    const total = num(l.total);
    const precio = num(l.precio_unitario);
    // El costo por empaque sale del total cuando lo hay: el precio impreso viene redondeado a 2
    // decimales y 10 × 1,82 no da los 18,17 que cobró el proveedor.
    const costo = total > 0 && cantidad > 0 ? total / cantidad : precio;
    const revisar = !(cantidad > 0) || !(costo > 0)
      || (precio > 0 && total > 0 && cantidad > 0 && Math.abs(precio * cantidad - total) > Math.max(0.05, total * 0.01));
    const porEmpaque = num(l.unidades_por_empaque);
    return {
      n: i + 1,
      codigo: texto(l.codigo, 50),
      descripcion: texto(l.descripcion, 200) || `Línea ${i + 1}`,
      cantidad: cantidad > 0 ? cantidad : null,
      unidad: texto(l.unidad, 30)?.toUpperCase() || null,
      unidades_por_empaque: porEmpaque > 0 ? porEmpaque : null,
      costo_empaque: costo > 0 ? costo : null,
      total: total > 0 ? total : (costo > 0 && cantidad > 0 ? r2(costo * cantidad) : null),
      exento: l.exento === true,
      revisar,
    };
  });

  const t = d.totales || {};
  const totales = {
    subtotal: num(t.subtotal), exento: num(t.exento), base_imponible: num(t.base_imponible),
    iva: num(t.iva), total: num(t.total), total_usd: num(t.total_usd),
  };
  const moneda = String(d.moneda_lineas || "").toUpperCase() === "USD" ? "USD" : "VES";
  let tasa = num(d.tasa);
  let tasaCalculada = false;
  if (!(tasa > 0) && moneda === "VES" && totales.total > 0 && totales.total_usd > 0) {
    tasa = r2(totales.total / totales.total_usd * 100) / 100;
    tasaCalculada = true;
  }

  // ¿Las líneas suman lo que dice el papel? Se compara contra el total de la misma moneda y SIN
  // IVA: subtotal, o exento + base, o el total cuando no hay impuesto.
  const suma = r2(lineas.reduce((a, l) => a + (l.total || 0), 0));
  let objetivo = null, etiqueta = null;
  if (moneda === "USD" && totales.total_usd > 0) { objetivo = totales.total_usd; etiqueta = "total en dólares"; }
  else if (moneda === "VES" && totales.subtotal > 0) { objetivo = totales.subtotal; etiqueta = "subtotal"; }
  else if (moneda === "VES" && (totales.exento > 0 || totales.base_imponible > 0)) { objetivo = r2((totales.exento || 0) + (totales.base_imponible || 0)); etiqueta = "exento + base imponible"; }
  else if (moneda === "VES" && totales.total > 0 && !(totales.iva > 0)) { objetivo = totales.total; etiqueta = "total"; }
  const cuadre = objetivo == null ? null : {
    suma, objetivo, etiqueta,
    diferencia: r2(suma - objetivo),
    cuadra: Math.abs(suma - objetivo) <= Math.max(0.05, objetivo * 0.0005),
  };

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(d.documento?.fecha || "")) ? d.documento.fecha : null;
  return {
    tipo: ["factura", "nota_entrega", "orden_entrega", "ticket_fiscal"].includes(d.tipo) ? d.tipo : "otro",
    emisor: { nombre: texto(d.emisor?.nombre), rif: texto(d.emisor?.rif, 20) },
    cliente_rif: texto(d.cliente?.rif, 20),
    documento: {
      numero: texto(d.documento?.numero, 40),
      numero_control: texto(d.documento?.numero_control, 40),
      fecha,
      condicion: texto(d.documento?.condicion, 60),
    },
    moneda, tasa: tasa > 0 ? tasa : null, tasa_calculada: tasaCalculada,
    totales, cuadre, lineas,
    dudas: (Array.isArray(d.dudas) ? d.dudas : []).map(x => texto(x, 300)).filter(Boolean).slice(0, 8),
  };
}

// ── Cruce con la tienda ────────────────────────────────────────────────────────

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
const SIN_ACENTO = (col) => `translate(upper(${col}), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')`;
const COLS_PRODUCTO = `p.id, p.name, p.barcode, p.unit, p.package_unit, p.package_size, p.cost_price,
  p.profit_margin, p.price, p.sellable, p.iva_tipo, p.piece_mode`;
const productoPublico = (p) => p && ({
  id: p.id, name: p.name, barcode: p.barcode || null, unit: p.unit, sellable: p.sellable !== false,
  package_unit: p.package_unit || null, package_size: p.package_size != null ? parseFloat(p.package_size) : null,
  cost_price: p.cost_price != null ? parseFloat(p.cost_price) : null,
  profit_margin: p.profit_margin != null ? parseFloat(p.profit_margin) : null,
  price: p.price != null ? parseFloat(p.price) : null, iva_tipo: p.iva_tipo, piece_mode: p.piece_mode || null,
});

async function proveedorSugerido(companyId, emisor, clienteRif) {
  const rif = soloRif(emisor.rif);
  // El RIF del comprador (la tienda) no es el del proveedor aunque el modelo los confunda.
  if (rif && rif.length >= 6 && rif !== soloRif(clienteRif)) {
    const [s] = await q(
      `SELECT id, name, rif FROM customers
        WHERE company_id = :cid AND type = 'proveedor'
          AND regexp_replace(upper(coalesce(rif, '')), '[^A-Z0-9]', '', 'g') = :rif
        LIMIT 1`, { cid: companyId, rif });
    if (s) return s;
  }
  const pal = palabras(emisor.nombre).filter(w => w.length >= 4 && !["COMPANIA", "ANONIMA", "DISTRIBUCIONES", "DISTRIBUIDORA", "INVERSIONES", "COMERCIAL"].includes(w));
  if (!pal.length) return null;
  const filas = await q(
    `SELECT id, name, rif FROM customers
      WHERE company_id = :cid AND type = 'proveedor' AND ${SIN_ACENTO("name")} LIKE :p
      ORDER BY id LIMIT 5`, { cid: companyId, p: `%${pal[0]}%` });
  return filas.length === 1 ? filas[0] : null;
}

// Parecido entre dos listas de palabras (Dice). Dos palabras valen igual si son la misma o, siendo
// largas, empiezan igual (MAIZORITO / MAIZORITOS, APURENITO / APURENO). Si las dos traen tamaño
// (300G, 1.5L) y ninguno coincide, son presentaciones distintas: el parecido se castiga.
const igual = (x, y) => x === y || (x.length >= 5 && y.length >= 5 && /^[A-Z]{5}/.test(x) && x.slice(0, 5) === y.slice(0, 5));
const esTamano = (w) => /\d/.test(w);
function parecido(a, b) {
  if (!a.length || !b.length) return 0;
  const comunes = a.filter(x => b.some(y => igual(x, y))).length;
  let s = (2 * comunes) / (a.length + b.length);
  const ta = a.filter(esTamano), tb = b.filter(esTamano);
  if (ta.length && tb.length && !ta.some(x => tb.includes(x))) s *= 0.5;
  return s;
}

// `filtro`: para quien no es admin, solo productos de sus sucursales o con código de barras (así
// los acepta la compra, ver assertLineasAccess). Vacío para el admin.
async function cruzarLinea(companyId, linea, filtro = "") {
  const base = `FROM products p
    WHERE p.company_id = :cid AND p.is_combo = false AND p.is_service = false AND p.is_variant_parent = false ${filtro}`;

  // 1. Ya se emparejó antes: la tienda le enseñó a Asta cómo llama este proveedor al producto.
  const k = clave(linea.descripcion);
  if (k) {
    const [a] = await q(
      `SELECT ${COLS_PRODUCTO}, a.package_unit AS alias_unit, a.package_size AS alias_size
         FROM compra_alias a JOIN products p ON p.id = a.product_id
        WHERE a.company_id = :cid AND a.clave = :k ${filtro} LIMIT 1`, { cid: companyId, k });
    if (a) {
      return {
        producto: productoPublico(a), como: "aprendido", alternativas: [],
        empaque: { unidad: a.alias_unit || null, tamano: a.alias_size != null ? parseFloat(a.alias_size) : null },
      };
    }
  }

  // 2. Código de barras impreso.
  const codigo = String(linea.codigo || "").replace(/\D/g, "");
  if (codigo.length >= 8) {
    const [p] = await q(`SELECT ${COLS_PRODUCTO} ${base} AND p.barcode = :c LIMIT 1`, { cid: companyId, c: codigo });
    if (p) return { producto: productoPublico(p), como: "codigo", alternativas: [] };
  }

  // 3. Por nombre: candidatos que tengan alguna de las palabras más largas y se elige por parecido.
  const pal = palabras(linea.descripcion);
  const claves = [...pal].filter(w => /[A-Z]/.test(w) && w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 3);
  if (!claves.length) return { producto: null, como: null, alternativas: [] };
  const cond = claves.map((_, i) => `${SIN_ACENTO("p.name")} LIKE :w${i}`).join(" OR ");
  const reps = { cid: companyId };
  claves.forEach((w, i) => { reps[`w${i}`] = `%${w}%`; });
  const candidatos = await q(`SELECT ${COLS_PRODUCTO} ${base} AND (${cond}) LIMIT 80`, reps);
  const puntuados = candidatos
    .map(p => ({ p, s: parecido(pal, palabras(p.name)) }))
    .filter(x => x.s >= 0.25)
    .sort((a, b) => b.s - a.s);
  const mejor = puntuados[0];
  // Solo se da por emparejado si se parece mucho y gana con claridad; si no, se ofrecen como "¿es
  // alguno de estos?". Mejor preguntar que meter la mercancía en el producto equivocado: con 0,5
  // "LAS LLAVES EN CREMA 250G" se iba a "JABON LAS LLAVES PANELA 250GR".
  if (mejor && mejor.s >= 0.7 && (!puntuados[1] || mejor.s - puntuados[1].s >= 0.1)) {
    return { producto: productoPublico(mejor.p), como: "nombre", alternativas: puntuados.slice(1, 3).map(x => productoPublico(x.p)) };
  }
  return { producto: null, como: null, alternativas: puntuados.slice(0, 3).map(x => productoPublico(x.p)) };
}

// ── Entrada ────────────────────────────────────────────────────────────────────

async function leer(req, { imagenes }) {
  const fotos = validarFotos(imagenes);

  const empresa = await asistente.empresaDelAsistente(req.company_id);
  if (!empresa?.activo) throw operacional("Cargar compras desde foto es parte de Asta, que no está activa para esta empresa. Habla con NXUS para activarla.", 403);
  const { usadas } = await asistente.usadasEsteMes(req.company_id);
  if (usadas + PESO > empresa.limite) {
    throw operacional(`Leer un documento gasta ${PESO} consultas y a tu tienda le quedan ${Math.max(0, empresa.limite - usadas)} este mes. El cupo se renueva el día 1.`, 429);
  }

  const inicio = Date.now();
  const pregunta = `[Compra desde foto] ${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}`;
  let uso = { cache: 0, entrada: 0, salida: 0 };
  let leido;
  try {
    const r = await preguntarAlModelo(fotos);
    uso = r.uso;
    if (!r.datos) throw operacional("No pude leer bien el documento. Revisa que la foto esté derecha, completa y con buena luz, y vuelve a intentarlo.", 422);
    leido = normalizar(r.datos);
    if (leido.tipo === "otro" || !leido.lineas.length) {
      throw operacional("No encontré productos en la foto. ¿Es la factura o nota de entrega del proveedor? Revisa que se vea completa y derecha.", 422);
    }
  } catch (err) {
    // El intento fallido queda anotado con su costo, pero no gasta cupo (error ≠ NULL).
    await asistente.anotar(req, { pregunta, herramientas: ["leer_compra"], uso, costo: deepseek.costoUsd(uso), ms: Date.now() - inicio, error: err.message });
    throw err;
  }

  const visibles = await visibleWarehouseIds(req);
  const filtro = visibles ? `AND (${condicionSucursal("p", visibles)} OR coalesce(p.barcode, '') <> '')` : "";
  const [proveedor, cruces] = await Promise.all([
    proveedorSugerido(req.company_id, leido.emisor, leido.cliente_rif),
    Promise.all(leido.lineas.map(l => cruzarLinea(req.company_id, l, filtro))),
  ]);
  const lineas = leido.lineas.map((l, i) => ({ ...l, ...cruces[i] }));

  const encontrados = lineas.filter(l => l.producto).length;
  await asistente.anotar(req, {
    pregunta,
    respuesta: `${leido.tipo} de ${leido.emisor.nombre || "proveedor sin nombre"}: ${lineas.length} líneas, ${encontrados} en el catálogo${leido.cuadre ? (leido.cuadre.cuadra ? ", cuadra" : `, diferencia ${leido.cuadre.diferencia}`) : ""}`,
    herramientas: ["leer_compra"], uso, costo: deepseek.costoUsd(uso), ms: Date.now() - inicio, consultas: PESO,
  });

  delete leido.cliente_rif;
  return {
    ...leido,
    lineas,
    proveedor_sugerido: proveedor ? { id: proveedor.id, name: proveedor.name, rif: proveedor.rif } : null,
    restantes: Math.max(0, empresa.limite - usadas - PESO),
    segundos: Math.round((Date.now() - inicio) / 1000),
  };
}

// La tienda confirmó qué producto es cada línea: se recuerda para la próxima factura.
async function recordarAlias(req, { lineas }) {
  if (!Array.isArray(lineas)) throw operacional("Faltan las líneas.");
  let guardadas = 0;
  for (const l of lineas.slice(0, 200)) {
    const k = clave(l.descripcion);
    const productId = parseInt(l.product_id);
    if (!k || !productId) continue;
    const [p] = await q(`SELECT id FROM products WHERE id = :id AND company_id = :cid`, { id: productId, cid: req.company_id });
    if (!p) continue;
    const tamano = num(l.package_size);
    await sequelize.query(
      `INSERT INTO compra_alias (company_id, clave, product_id, package_unit, package_size)
       VALUES (:cid, :k, :pid, :unidad, :tamano)
       ON CONFLICT (company_id, clave) DO UPDATE
         SET product_id = EXCLUDED.product_id, package_unit = EXCLUDED.package_unit,
             package_size = EXCLUDED.package_size, veces = compra_alias.veces + 1, updated_at = NOW()`,
      { replacements: { cid: req.company_id, k, pid: productId, unidad: texto(l.package_unit, 50), tamano: tamano > 0 ? tamano : null } }
    );
    guardadas++;
  }
  return { guardadas };
}

module.exports = { leer, recordarAlias, PESO, _prueba: { num, palabras, clave, normalizar, parecido, cruzarLinea } };
