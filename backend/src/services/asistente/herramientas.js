'use strict';

// Herramientas del asistente: lo ÚNICO con que el modelo puede leer datos de la tienda. Nunca
// escribe SQL: cada herramienta llama a un reporte que ya existe, con el mismo contexto del
// usuario (buildTenantContext), así que el recorte por empresa y por sucursal es el de siempre.
//
// Permisos, dos veces:
//  1. Al modelo solo se le ofrecen las herramientas que el usuario puede usar (disponibles). Un
//     cajero sin "Ver reportes" no sabe que existe el resumen de ventas.
//  2. Cada ejecución vuelve a comprobar el permiso (ejecutar), por si el modelo inventa una
//     llamada.
//
// Lo que sale hacia DeepSeek pasa por `limpiar`: sin teléfonos, RIF, cédulas, correos ni
// direcciones, y con los números redondeados. Los montos ya vienen totalizados de los reportes:
// el modelo los copia, no los calcula (cero discrepancias con lo que muestra la pantalla).

const { hasPermission, scopeWarehouseIds } = require("../../middleware/auth");
const { buildTenantContext, TZ } = require("../reports/shared");
const reportes = require("../reports");
const { sequelize, Sequelize } = require("../../models");

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

const fecha = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const fecha_ = fecha;   // para usarla donde una variable local se llama `fecha`

// Rango pedido por el modelo; sin fechas, hoy. Un rango al revés se endereza en vez de devolver
// vacío, y se limita a un año para que nadie pida diez años de ventas de una sola vez.
function rango(args) {
  let desde = fecha(args.desde) || fecha(args.hasta) || hoy();
  let hasta = fecha(args.hasta) || desde;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const unAnio = new Date(new Date(hasta).getTime() - 366 * 864e5).toISOString().slice(0, 10);
  if (desde < unAnio) desde = unAnio;
  return { desde, hasta };
}

const SENSIBLE = /(phone|telefono|rif|tax_id|doc_id|cedula|address|direccion|email|correo)/i;
const ES_CANTIDAD = /(qty|stock|units|needed|min_stock|cantidad)/i;

function limpiar(valor, clave = "") {
  if (valor === null || valor === undefined) return valor;
  // Fecha en hora de Caracas; con la hora cuando la tiene (un turno abierto, una comanda).
  if (valor instanceof Date) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(valor).map(x => [x.type, x.value]));
    const dia = `${p.year}-${p.month}-${p.day}`;
    return p.hour === "00" && p.minute === "00" ? dia : `${dia} ${p.hour}:${p.minute}`;
  }
  if (Array.isArray(valor)) return valor.map(v => limpiar(v, clave));
  if (typeof valor === "object") {
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      if (SENSIBLE.test(k)) continue;
      if (k === "id" || k.endsWith("_id")) continue;   // ids internos: al modelo no le dicen nada
      out[k] = limpiar(v, k);
    }
    return out;
  }
  // Los DECIMAL de Postgres llegan como texto ("6.00000"): se pasan a número para redondearlos.
  if (typeof valor === "string" && /^-?\d+\.\d+$/.test(valor)) valor = parseFloat(valor);
  if (typeof valor === "number" && !Number.isInteger(valor)) {
    const d = ES_CANTIDAD.test(clave) ? 1000 : 100;
    return Math.round(valor * d) / d;
  }
  return valor;
}

const primeros = (lista, n) => (Array.isArray(lista) ? lista.slice(0, n) : []);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Facturas abiertas (por cobrar y por pagar) ────────────────────────────────
// "¿Qué facturas tienen más de 60 días?" se pregunta por días desde que se EMITIÓ, no por días
// de atraso (que dependen del plazo de crédito). Se dan las dos cosas.
const diaCaracas = (v) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(v));
const diasDesde = (v) => Math.round((Date.parse(hoy()) - Date.parse(diaCaracas(v))) / 864e5);

function filtrarFacturas(lista, args, nombreDe) {
  let r = Array.isArray(lista) ? lista : [];
  const min = parseInt(args.antiguedad_min_dias, 10);
  if (min > 0) r = r.filter(f => diasDesde(f.created_at) > min);
  if (args.solo_vencidas) r = r.filter(f => f.days_overdue > 0);
  const palabras = sinAcento(args.cliente || "").split(/\s+/).filter(Boolean);
  if (palabras.length) r = r.filter(f => { const n = sinAcento(nombreDe(f)); return palabras.every(p => n.includes(p)); });
  return r;
}

function porAntiguedad(lista) {
  const tramos = [["0 a 30 días", 0, 30], ["31 a 60 días", 31, 60], ["61 a 90 días", 61, 90], ["más de 90 días", 91, Infinity]];
  return tramos.map(([tramo, desde, hasta]) => {
    const fs = (lista || []).filter(f => { const d = diasDesde(f.created_at); return d >= desde && d <= hasta; });
    return { tramo, facturas: fs.length, monto: r2(fs.reduce((t, f) => t + f.balance, 0)) };
  });
}

const MAX_FACTURAS = 80;
function listaFacturas(fs, extra) {
  const orden = [...fs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return {
    facturas_encontradas: fs.length,
    saldo_de_estas: r2(fs.reduce((t, f) => t + f.balance, 0)),
    facturas: orden.slice(0, MAX_FACTURAS).map(f => ({
      factura: f.invoice_number, ...extra(f), fecha: diaCaracas(f.created_at), dias_desde_emision: diasDesde(f.created_at),
      vence: f.due_date, dias_de_atraso: f.days_overdue > 0 ? f.days_overdue : 0, total: f.total, saldo: f.balance, sucursal: f.warehouse_name,
    })),
    ...(fs.length > MAX_FACTURAS ? { nota: `Son ${fs.length}; aquí van las ${MAX_FACTURAS} más viejas.` } : {}),
  };
}

// Sucursal pedida por el modelo, validada contra las que el usuario puede ver. Los reportes
// también la validan; esto solo da un mensaje más claro.
async function sucursal(req, args) {
  const id = parseInt(args.sucursal_id, 10);
  if (!id) return undefined;
  const permitidas = await scopeWarehouseIds(req, { includeDeposits: true });
  if (Array.isArray(permitidas) && !permitidas.includes(id)) {
    throw Object.assign(new Error("No tienes acceso a esa sucursal"), { status: 403, isOperational: true });
  }
  return id;
}

const PARAM_RANGO = {
  desde: { type: "string", description: "Fecha inicial YYYY-MM-DD. Si no se indica, hoy." },
  hasta: { type: "string", description: "Fecha final YYYY-MM-DD (incluida). Si no se indica, igual a 'desde'." },
  sucursal_id: { type: "integer", description: "Id de una sucursal del contexto: la de trabajo u otra a la que el usuario tiene acceso. Omitir para la(s) de trabajo." },
};

const HERRAMIENTAS = [
  {
    nombre: "resumen_ventas",
    descripcion: "Resumen de ventas de un período: total facturado, número de ventas, ticket promedio, pendiente por cobrar de esas ventas, devoluciones, cobros por método de pago, ventas por cajero, por día y por hora (para ver las horas fuertes y flojas).",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.salesReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, warehouse_id: await sucursal(req, args) });
      return {
        periodo: { desde, hasta },
        resumen: r.summary,
        cobros_por_metodo: primeros(r.by_method, 15),
        por_cajero: primeros(r.by_employee, 15),
        por_dia: primeros(r.by_day, 31),
        por_hora: primeros(r.by_hour, 24),
      };
    },
  },
  {
    nombre: "productos_mas_vendidos",
    descripcion: "Productos más vendidos de un período, por monto o por cantidad, con categoría, unidades vendidas y monto.",
    parametros: {
      ...PARAM_RANGO,
      orden: { type: "string", enum: ["monto", "cantidad"], description: "Ordenar por monto vendido (por defecto) o por cantidad." },
      limite: { type: "integer", description: "Cuántos productos (1 a 20, por defecto 10)." },
    },
    permisos: ["reports.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const limite = Math.min(Math.max(parseInt(args.limite, 10) || 10, 1), 20);
      const r = await reportes.productsReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, limit: limite, warehouse_id: await sucursal(req, args) });
      const lista = args.orden === "cantidad" ? r.top_by_qty : r.top_by_revenue;
      return {
        periodo: { desde, hasta },
        orden: args.orden === "cantidad" ? "cantidad" : "monto",
        productos: primeros(lista, limite),
        por_categoria: primeros(r.by_subcategory, 10),
      };
    },
  },
  {
    nombre: "existencia_producto",
    descripcion: "Busca productos por nombre, código de barras o principio activo y devuelve su existencia y precio en cada sucursal que el usuario ve. En farmacias trae además principio activo, concentración, anaquel y si es de venta libre, con récipe o controlado: buscar por el principio activo da los equivalentes.",
    parametros: {
      buscar: { type: "string", description: "Nombre (o parte), código de barras o principio activo (genérico) del producto." },
    },
    requeridos: ["buscar"],
    permisos: ["products.view", "inventory.view"],
    async ejecutar(req, args) {
      const texto = String(args.buscar || "").trim().slice(0, 80);
      if (texto.length < 2) return { error: "Indica al menos dos letras del producto." };
      const permitidas = await scopeWarehouseIds(req, { includeDeposits: true });
      if (Array.isArray(permitidas) && !permitidas.length) return { productos: [] };
      // El recorte de sucursales va en el JOIN: el producto aparece igual, solo con las suyas.
      const whFiltro = Array.isArray(permitidas) ? `AND ps.warehouse_id IN (${permitidas.filter(Number.isInteger).join(",")})` : "";
      const filas = await sequelize.query(
        `SELECT p.id, p.name, p.unit, p.barcode, p.is_service, p.is_combo,
                p.active_ingredient, p.concentration, p.shelf_location, p.prescription_type,
                w.name AS sucursal, ps.qty, COALESCE(ps.price, p.price)::float AS precio
           FROM products p
           LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.company_id = p.company_id ${whFiltro}
           LEFT JOIN warehouses w ON w.id = ps.warehouse_id
          WHERE p.company_id = :cid
            AND p.is_variant_parent = false
            AND (translate(lower(p.name), 'áéíóúüñàèìòù', 'aeiouunaeiou') LIKE :like OR p.barcode = :exacto
                 OR translate(lower(COALESCE(p.active_ingredient, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou') LIKE :like)
          ORDER BY (p.barcode IS NOT DISTINCT FROM :exacto) DESC, p.name ASC, w.name ASC
          LIMIT 60`,
        { replacements: { cid: req.company_id, like: `%${String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[%_]/g, "")}%`, exacto: texto }, type: Sequelize.QueryTypes.SELECT }
      );
      const porProducto = new Map();
      for (const f of filas) {
        if (!porProducto.has(f.id)) {
          if (porProducto.size >= 8) continue;
          porProducto.set(f.id, {
            producto: f.name, unidad: f.unit, codigo: f.barcode,
            tipo: f.is_service ? "servicio" : f.is_combo ? "combo" : "producto",
            // Ficha farmacéutica: solo cuando existe (en las demás tiendas va vacía y se omite).
            ...(f.active_ingredient ? { principio_activo: f.active_ingredient } : {}),
            ...(f.concentration ? { concentracion: f.concentration } : {}),
            ...(f.shelf_location ? { anaquel: f.shelf_location } : {}),
            ...(f.prescription_type && f.prescription_type !== "libre" ? { venta: f.prescription_type === "controlado" ? "controlado" : "con récipe" } : {}),
            sucursales: [],
          });
        }
        if (f.sucursal) porProducto.get(f.id).sucursales.push({ sucursal: f.sucursal, existencia: parseFloat(f.qty) || 0, precio: f.precio });
      }
      return { buscado: texto, productos: [...porProducto.values()] };
    },
  },
  {
    nombre: "productos_por_agotarse",
    descripcion: "Productos con existencia por debajo de su mínimo (críticos) y productos agotados (en cero).",
    parametros: { sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["reports.view", "inventory.view"],
    async ejecutar(req, args) {
      const ctx = { ...(await buildTenantContext(req)), warehouse_id: await sucursal(req, args), limit: 25 };
      const [criticos, agotados] = await Promise.all([
        reportes.inventoryReport({ ...ctx, view: "critical" }),
        reportes.inventoryReport({ ...ctx, view: "zero" }),
      ]);
      return {
        criticos_total: criticos.summary?.critical_count,
        agotados_total: criticos.summary?.zero_count,
        criticos: primeros(criticos.critical_stock, 25),
        agotados: primeros(agotados.zero_stock, 25),
      };
    },
  },
  {
    nombre: "cuentas_por_cobrar",
    descripcion: "Lo que los clientes deben hoy, igual que Contabilidad, Cuentas por cobrar: saldo total, vencido, por vencer, antigüedad (por días desde que se emitió y por días de atraso) y los clientes que más deben. detalle='clientes' trae TODOS los deudores (hasta 150) para dar la lista completa. detalle='facturas' trae las facturas abiertas una por una (número, cliente, fecha, días desde que se emitió, vencimiento, días de atraso, saldo), y se puede filtrar por antigüedad mínima, solo vencidas o un cliente.",
    parametros: {
      detalle: { type: "string", enum: ["resumen", "clientes", "facturas"], description: "resumen (por defecto), clientes (lista completa de deudores) o facturas (una por una)." },
      antiguedad_min_dias: { type: "integer", description: "Solo facturas emitidas hace MÁS de N días (por ejemplo 60 para 'más de 60 días')." },
      solo_vencidas: { type: "boolean", description: "Solo facturas que ya pasaron su fecha de vencimiento." },
      cliente: { type: "string", description: "Nombre o parte del nombre de un cliente para ver solo lo suyo." },
      sucursal_id: PARAM_RANGO.sucursal_id,
    },
    permisos: ["reports.view"],
    async ejecutar(req, args) {
      const { getReceivables } = require("../sales/receivables");
      const { data } = await getReceivables({ warehouse_id: await sucursal(req, args) }, req);
      const facturas = filtrarFacturas(data.invoices, args, f => f.customer_name);
      const detalle = args.detalle || (args.antiguedad_min_dias || args.solo_vencidas || args.cliente ? "facturas" : "resumen");
      const clientes = data.customers.map(c => ({
        cliente: c.customer_name, saldo: c.balance, vencido: c.overdue_balance, facturas: c.invoice_count,
        dias_de_atraso_maximo: c.max_days_overdue > 0 ? c.max_days_overdue : 0, proximo_vencimiento: c.next_due_date,
      }));
      return {
        resumen: {
          saldo_total: data.summary.total_balance, vencido: data.summary.overdue_balance, facturas_vencidas: data.summary.overdue_count,
          por_vencer_pronto: data.summary.due_soon_balance, facturas_abiertas: data.summary.invoice_count, clientes_con_deuda: data.summary.customer_count,
        },
        antiguedad_desde_emision: porAntiguedad(data.invoices),
        atraso: Object.values(data.aging).map(a => ({ tramo: a.label, facturas: a.count, monto: a.amount })),
        ...(detalle === "clientes"
          ? { deudores: clientes.slice(0, 150), nota: clientes.length > 150 ? `Son ${clientes.length}; aquí van los 150 que más deben.` : undefined }
          : { clientes_que_mas_deben: clientes.slice(0, 15) }),
        ...(detalle === "facturas" ? listaFacturas(facturas, f => ({ cliente: f.customer_name })) : {}),
      };
    },
  },
  {
    nombre: "ingresos_egresos",
    descripcion: "Dinero que entró (cobros e ingresos) y salió (egresos y gastos) en un período, con el neto, y los egresos por tipo y por método.",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.view", "journals.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.financeReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, warehouse_id: await sucursal(req, args) });
      return {
        periodo: { desde, hasta },
        moneda_base: r.base_symbol,
        moneda_local: r.local_symbol,
        resumen: r.summary,
        egresos_por_tipo: r.expenses?.by_kind,
        egresos_por_metodo: primeros(r.expenses?.by_method, 10),
        egresos_mayores: primeros([...(r.expenses?.rows || [])].sort((a, b) => (b.amount_base || 0) - (a.amount_base || 0)), 10),
      };
    },
  },
  {
    nombre: "margenes",
    descripcion: "Ganancia de un período: ventas, costo, margen total y porcentaje; los productos que más dejan, los de menor margen, por categoría y los que no tienen costo cargado.",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.marginsReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, limit: 10, warehouse_id: await sucursal(req, args) });
      return {
        periodo: { desde, hasta },
        resumen: r.summary,
        productos_que_mas_dejan: primeros(r.by_product, 10),
        menor_margen: primeros(r.bottom_margin, 5),
        por_categoria: primeros(r.by_category, 10),
        sin_costo: primeros(r.sin_costo, 10),
      };
    },
  },
];

// ── Consultas de la segunda tanda (20-11-2026): "todo lo que un usuario o administrador puede
// preguntar". Caja del turno, cajas y bancos, clientes, facturas, tasas, compras y proveedores,
// vencimientos, mermas, clientes, auditoría y, en restaurantes, mesas y cocina.

const QT = Sequelize.QueryTypes;

// Búsqueda sin acentos ni mayúsculas: "José Mujica" tiene que encontrar a "JOSE MUJICA" y al
// revés. translate() no necesita la extensión unaccent (que Supabase no trae encendida).
const SIN_ACENTO = (col) => `translate(lower(${col}), 'áéíóúüñàèìòù', 'aeiouunaeiou')`;
const sinAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[%_]/g, "");

// El mismo req con otro query: varios servicios leen sus filtros de req.query. Object.create
// conserva todo lo demás (empleado, empresa, X-Sucursales y la caché de sucursales).
const conQuery = (req, query = {}) => Object.assign(Object.create(req), { query });

async function idsSucursales(req, { depositos = false } = {}) {
  const ids = await scopeWarehouseIds(req, { includeDeposits: depositos });
  return Array.isArray(ids) ? ids.filter(Number.isInteger) : null;   // null = todas (admin)
}
const enSucursales = (ids, col) => (ids === null ? "" : ids.length ? `AND ${col} IN (${ids.join(",")})` : "AND FALSE");

HERRAMIENTAS.push(
  {
    nombre: "caja_turno",
    descripcion: "Turnos de caja abiertos ahora: cajero, sucursal, desde cuándo, ventas del turno y, por cada caja, fondo inicial, cobros en efectivo, ingresos, salidas (vueltos y egresos), avances y cuánto DEBERÍA haber en la gaveta. Un cajero ve solo su turno; quien tiene reportes ve todos.",
    parametros: { sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["sales.cash", "reports.view", "journals.view"],
    async ejecutar(req, args) {
      const gerente = ["reports.view", "journals.view"].some(p => hasPermission(req.employee?.permissions, p));
      const wid = await sucursal(req, args);
      const ids = wid ? [wid] : await idsSucursales(req);
      const sesiones = await sequelize.query(
        `SELECT cs.id FROM cash_sessions cs
          WHERE cs.company_id = :cid AND cs.status = 'open' ${enSucursales(ids, "cs.warehouse_id")}
            ${gerente ? "" : "AND cs.employee_id = :eid"}
          ORDER BY cs.opened_at DESC LIMIT 6`,
        { replacements: { cid: req.company_id, eid: req.employee?.id }, type: QT.SELECT }
      );
      if (!sesiones.length) return { turnos_abiertos: 0, nota: gerente ? "No hay turnos abiertos en estas sucursales." : "No tienes un turno abierto." };
      const getSessionSummary = require("../cashSessions/getSessionSummary");
      const turnos = [];
      for (const { id } of sesiones) {
        const r = await getSessionSummary(id, req);
        turnos.push({
          cajero: r.session?.employee?.full_name,
          sucursal: r.session?.warehouse?.name,
          abierto_desde: r.session?.opened_at,
          ventas: r.sales,
          devoluciones: r.returns,
          cajas: (r.journal_summary || []).map(j => ({
            caja: j.journal_name, moneda: j.currency_symbol, fondo_inicial: j.opening_amount,
            cobros_efectivo: j.cash_in, ingresos_manuales: j.manual_in, salidas_vueltos_y_egresos: j.cash_out,
            avances_entregados: j.advance_out, deberia_haber: j.expected_amount,
          })),
        });
      }
      return { turnos_abiertos: turnos.length, turnos };
    },
  },
  {
    nombre: "saldos_cajas_bancos",
    descripcion: "Cada caja y cuenta bancaria con su movimiento acumulado (cobros + ingresos − egresos) y lo movido hoy, en la moneda de cada una. Es lo que muestra Contabilidad, Estado de Cuenta.",
    parametros: { sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["journals.view"],
    async ejecutar(req, args) {
      const wid = await sucursal(req, args);
      const { getSummary } = require("../paymentJournals/paymentJournalService");
      const { data } = await getSummary(conQuery(req, wid ? { warehouse_id: wid } : {}));
      return {
        cuentas: data.map(j => ({
          cuenta: j.name, tipo: j.type, banco: j.bank_name, sucursal: j.warehouse_name,
          moneda: j.currency_symbol, acumulado: parseFloat(j.total_ingresos) || 0, hoy: parseFloat(j.ingresos_hoy) || 0,
        })),
      };
    },
  },
  {
    nombre: "buscar_cliente",
    descripcion: "Busca clientes por nombre o RIF/cédula y devuelve lo que deben, su saldo a favor, cuántas compras llevan, la última compra y sus facturas abiertas con los productos de cada una.",
    parametros: { buscar: { type: "string", description: "Nombre (o parte) o documento del cliente." } },
    requeridos: ["buscar"],
    permisos: ["customers.view", "sales.create"],
    async ejecutar(req, args) {
      const texto = String(args.buscar || "").trim().slice(0, 60);
      if (texto.length < 2) return { error: "Indica al menos dos letras del cliente." };
      // Se busca sin acentos (cada palabra por separado) y la ficha sale de getOne, la misma de
      // Contactos: deuda, compras y saldo a favor iguales a los de la pantalla.
      const palabras = sinAcento(texto).split(/\s+/).filter(Boolean).slice(0, 4);
      if (!palabras.length) return { error: "Indica el nombre o el documento del cliente." };
      const halladas = await sequelize.query(
        `SELECT id FROM customers
          WHERE company_id = :cid AND type = 'cliente'
            AND ${palabras.map((_, i) => `(${SIN_ACENTO("name")} LIKE :p${i} OR ${SIN_ACENTO("COALESCE(rif, '')")} LIKE :p${i})`).join(" AND ")}
          ORDER BY name LIMIT 4`,
        { replacements: { cid: req.company_id, ...Object.fromEntries(palabras.map((p, i) => [`p${i}`, `%${p}%`])) }, type: QT.SELECT }
      );
      const { getOne } = require("../customers/customerService");
      const ids = await idsSucursales(req, { depositos: true });
      const clientes = [];
      for (const { id } of halladas) {
        const r = await getOne(id, req).catch(() => null);
        if (!r?.data) continue;
        const j = r.data.toJSON ? r.data.toJSON() : r.data;
        const abiertas = await sequelize.query(
          `SELECT s.id, s.invoice_number AS factura, s.created_at AS fecha, s.total::float AS total, s.status AS estado,
                  (s.total - COALESCE(s.forgiven_amount, 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id = s.id), 0))::float AS saldo
             FROM sales s
            WHERE s.company_id = :cid AND s.customer_id = :id AND s.status IN ('borrador', 'pendiente', 'parcial') ${enSucursales(ids, "s.warehouse_id")}
            ORDER BY s.created_at LIMIT 10`,
          { replacements: { cid: req.company_id, id: j.id }, type: QT.SELECT }
        );
        // Lo que se llevó en cada factura abierta: "¿y qué se llevó ese día?" es la pregunta que sigue.
        if (abiertas.length) {
          const items = await sequelize.query(
            `SELECT sale_id, name AS producto, quantity::float AS cantidad, subtotal::float AS subtotal
               FROM sale_items WHERE sale_id IN (:ids) ORDER BY sale_id, id`,
            { replacements: { ids: abiertas.map(a => a.id) }, type: QT.SELECT }
          );
          for (const a of abiertas) {
            const suyos = items.filter(i => i.sale_id === a.id);
            a.productos = suyos.slice(0, 12).map(({ sale_id, ...i }) => i);   // eslint-disable-line no-unused-vars
            if (suyos.length > 12) a.mas_productos = suyos.length - 12;
          }
        }
        clientes.push({
          cliente: j.name, deuda_total: parseFloat(j.total_debt || 0), saldo_a_favor: parseFloat(j.credit_available ?? j.credit_balance ?? 0),
          compras: parseInt(j.total_purchases || 0, 10), total_comprado: parseFloat(j.total_spent || 0), ultima_compra: j.last_purchase_at || null,
          facturas_abiertas: abiertas,
        });
      }
      return { buscado: texto, clientes };
    },
  },
  {
    nombre: "buscar_factura",
    descripcion: "Busca una factura por su número y devuelve fecha, cliente, cajero, estado, total, lo pagado, el saldo, sus productos y cómo la pagaron.",
    parametros: { numero: { type: "string", description: "Número de factura o parte (por ejemplo A-0125 o 125)." } },
    requeridos: ["numero"],
    permisos: ["sales.view"],
    async ejecutar(req, args) {
      const numero = String(args.numero || "").trim().slice(0, 30);
      if (!numero) return { error: "Indica el número de la factura." };
      const ids = await idsSucursales(req, { depositos: true });
      const ventas = await sequelize.query(
        `SELECT s.id, s.invoice_number AS factura, s.created_at AS fecha, s.status AS estado, s.total::float AS total,
                COALESCE(s.forgiven_amount, 0)::float AS exonerado, c.name AS cliente, e.full_name AS cajero, w.name AS sucursal,
                COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id = s.id), 0)::float AS pagado
           FROM sales s
           LEFT JOIN customers c ON c.id = s.customer_id
           LEFT JOIN employees e ON e.id = s.employee_id
           LEFT JOIN warehouses w ON w.id = s.warehouse_id
          WHERE s.company_id = :cid AND s.invoice_number ILIKE :n ${enSucursales(ids, "s.warehouse_id")}
          ORDER BY (s.invoice_number = :exacto) DESC, s.created_at DESC LIMIT 3`,
        { replacements: { cid: req.company_id, n: `%${numero.replace(/[%_]/g, "")}%`, exacto: numero }, type: QT.SELECT }
      );
      const facturas = [];
      for (const v of ventas) {
        const [items, pagos] = await Promise.all([
          sequelize.query(`SELECT name AS producto, quantity::float AS cantidad, subtotal::float AS subtotal FROM sale_items WHERE sale_id = :id ORDER BY id LIMIT 25`, { replacements: { id: v.id }, type: QT.SELECT }),
          sequelize.query(
            `SELECT COALESCE(pj.name, p.payment_method) AS forma_de_pago, p.amount::float AS monto, p.created_at AS fecha
               FROM payments p LEFT JOIN payment_journals pj ON pj.id = p.payment_journal_id
              WHERE p.sale_id = :id ORDER BY p.created_at`,
            { replacements: { id: v.id }, type: QT.SELECT }),
        ]);
        facturas.push({ ...v, saldo: Math.round((v.total - v.exonerado - v.pagado) * 100) / 100, productos: items, pagos });
      }
      return { buscado: numero, facturas };
    },
  },
  {
    nombre: "tasas_de_cambio",
    descripcion: "Monedas de la tienda con su tasa de hoy (cuántos de esa moneda por 1 de la moneda base) y la tasa de los últimos días. Úsala también para convertir montos entre Ref. y bolívares.",
    parametros: {},
    permisos: [],
    async ejecutar(req) {
      const monedas = await sequelize.query(
        `SELECT id, name AS moneda, code AS codigo, symbol AS simbolo, exchange_rate::float AS tasa, is_base AS base, is_local AS local
           FROM currencies WHERE company_id = :cid AND active ORDER BY is_base DESC, is_local DESC, name`,
        { replacements: { cid: req.company_id }, type: QT.SELECT }
      );
      const local = monedas.find(m => m.local) || monedas.find(m => !m.base);
      const historial = local ? await sequelize.query(
        `SELECT rate_date AS fecha, rate::float AS tasa FROM currency_rates
          WHERE currency_id = :mid AND (company_id = :cid OR company_id IS NULL) ORDER BY rate_date DESC LIMIT 7`,
        { replacements: { mid: local.id, cid: req.company_id }, type: QT.SELECT }) : [];
      return { monedas, historial_moneda_local: historial };
    },
  },
  {
    nombre: "compras_proveedores",
    descripcion: "Compras de un período: total comprado, número de órdenes, por proveedor, por día y los productos más comprados.",
    parametros: { ...PARAM_RANGO },
    permisos: ["purchases.view", "reports.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.purchasesReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, limit: 10, warehouse_id: await sucursal(req, args) });
      return { periodo: { desde, hasta }, resumen: r.summary, por_proveedor: primeros(r.by_supplier, 10), productos_mas_comprados: primeros(r.top_products, 10) };
    },
  },
  {
    nombre: "cuentas_por_pagar",
    descripcion: "Lo que la tienda les debe a sus proveedores hoy, igual que Contabilidad, Cuentas por pagar: total, vencido, por vencer, cada proveedor con su saldo. detalle='facturas' trae las compras pendientes una por una (orden, proveedor, fecha, días desde la compra, vencimiento, días de atraso, total, pagado, saldo), filtrable por antigüedad, solo vencidas o un proveedor.",
    parametros: {
      detalle: { type: "string", enum: ["resumen", "facturas"], description: "resumen (por defecto) o facturas (una por una)." },
      antiguedad_min_dias: { type: "integer", description: "Solo compras de hace MÁS de N días." },
      solo_vencidas: { type: "boolean", description: "Solo las que ya pasaron su vencimiento." },
      proveedor: { type: "string", description: "Nombre o parte del nombre de un proveedor." },
      sucursal_id: PARAM_RANGO.sucursal_id,
    },
    permisos: ["purchases.view", "purchases.pay"],
    async ejecutar(req, args) {
      const { getPayables } = require("../purchases/payablesService");
      const { data } = await getPayables({ warehouse_id: await sucursal(req, args) }, req);
      const facturas = filtrarFacturas(data.invoices, { ...args, cliente: args.proveedor }, f => f.supplier_name);
      const detalle = args.detalle || (args.antiguedad_min_dias || args.solo_vencidas || args.proveedor ? "facturas" : "resumen");
      return {
        resumen: {
          total_que_debes: data.summary.total_balance, vencido: data.summary.overdue_balance, compras_vencidas: data.summary.overdue_count,
          por_vencer_pronto: data.summary.due_soon_balance, compras_pendientes: data.summary.invoice_count, proveedores_con_saldo: data.summary.supplier_count,
        },
        antiguedad_desde_compra: porAntiguedad(data.invoices),
        proveedores: data.suppliers.slice(0, 50).map(s => ({
          proveedor: s.supplier_name, saldo: s.balance, vencido: s.overdue_balance, compras: s.invoice_count,
          dias_de_atraso_maximo: s.max_days_overdue > 0 ? s.max_days_overdue : 0, proximo_vencimiento: s.next_due_date,
        })),
        ...(detalle === "facturas" ? listaFacturas(facturas, f => ({ orden: `#${f.id}`, proveedor: f.supplier_name, pagado: f.amount_paid })) : {}),
      };
    },
  },
  {
    nombre: "productos_por_vencer",
    descripcion: "Lotes con existencia y su fecha de vencimiento: los vencidos y los que vencen pronto, con días que faltan, cantidad y valor en riesgo.",
    parametros: { dias: { type: "integer", description: "Ventana en días hacia adelante (por defecto 30)." }, sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["reports.view", "inventory.view"],
    async ejecutar(req, args) {
      const dias = Math.min(Math.max(parseInt(args.dias, 10) || 30, 1), 365);
      const lotes = await reportes.expiryReport({ ...(await buildTenantContext(req)), warehouse_id: await sucursal(req, args) });
      const cerca = lotes.filter(l => l.days_left <= dias);
      return {
        ventana_dias: dias,
        vencidos: cerca.filter(l => l.days_left < 0).length,
        por_vencer: cerca.filter(l => l.days_left >= 0).length,
        lotes: cerca.slice(0, 25).map(l => ({
          producto: l.product, lote: l.lot, vence: l.expiry, dias: l.days_left, cantidad: l.stock, unidad: l.unit, valor_en_riesgo: l.value_at_risk, sucursal: l.warehouse,
          ...(l.active_ingredient ? { principio_activo: l.active_ingredient } : {}), ...(l.shelf_location ? { anaquel: l.shelf_location } : {}),
        })),
      };
    },
  },
  {
    nombre: "mermas",
    descripcion: "Pérdidas de inventario de un período (merma, vencidos, robo, faltantes de conteo, ajustes sin motivo, pérdidas en transferencias) con su costo, por motivo y por producto; aparte el consumo interno.",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.view", "inventory.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.mermasReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, warehouse_id: await sucursal(req, args) });
      return { periodo: { desde, hasta }, resumen: r.summary, por_motivo: r.groups, por_producto: primeros(r.by_product, 10) };
    },
  },
  {
    nombre: "analisis_clientes",
    descripcion: "Mejores clientes de un período (por monto comprado), clientes nuevos, clientes que dejaron de venir y la tasa de clientes que repiten.",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.view"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const r = await reportes.customersReport({ ...(await buildTenantContext(req)), date_from: desde, date_to: hasta, limit: 10, warehouse_id: await sucursal(req, args) });
      return { periodo: { desde, hasta }, mejores: primeros(r.top_customers, 10), nuevos: primeros(r.new_customers, 10), dejaron_de_venir: primeros(r.inactive_customers, 10), dias_sin_venir: r.inactive_days, repiten: r.repeat_rate, totales: r.totals };
    },
  },
  {
    nombre: "auditoria",
    descripcion: "Control de un período: ventas anuladas, devoluciones (por empleado y detalle) y descuentos dados.",
    parametros: { ...PARAM_RANGO },
    permisos: ["reports.audit"],
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const ctx = await buildTenantContext(req);
      const wid = await sucursal(req, args);
      const r = await reportes.auditReport({ ...ctx, date_from: desde, date_to: hasta, limit: 15, warehouse_id: wid });
      const ids = wid ? [wid] : await idsSucursales(req);
      const anuladas = await sequelize.query(
        `SELECT s.invoice_number AS factura, s.total::float AS total, s.created_at AS fecha, e.full_name AS cajero
           FROM sales s LEFT JOIN employees e ON e.id = s.employee_id
          WHERE s.company_id = :cid AND s.status = 'anulado' ${enSucursales(ids, "s.warehouse_id")}
            AND (s.created_at AT TIME ZONE '${TZ}')::date BETWEEN :desde AND :hasta
          ORDER BY s.created_at DESC LIMIT 15`,
        { replacements: { cid: req.company_id, desde, hasta }, type: QT.SELECT }
      );
      return { periodo: { desde, hasta }, anuladas, devoluciones: r.returns_summary, devoluciones_por_empleado: primeros(r.by_employee, 10), devoluciones_detalle: primeros(r.returns_list, 10), descuentos: primeros(r.discounts, 15) };
    },
  },
  {
    nombre: "mesas_abiertas",
    descripcion: "Mesas con cuenta abierta ahora: mesa y área, mesonero, total, desde qué hora, si pidió la cuenta y cómo va en cocina; y los pedidos del QR esperando al mesonero.",
    parametros: { sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["tables.view", "sales.create"],
    modulo: "cocina_enabled",
    async ejecutar(req, args) {
      const wid = await sucursal(req, args);
      const ids = wid ? [wid] : await idsSucursales(req);
      const [mesas, qr] = await Promise.all([
        sequelize.query(
          `SELECT t.name AS mesa, a.name AS area, COALESCE(w.full_name, e.full_name) AS mesonero, s.total::float AS total,
                  s.created_at AS abierta_desde, (s.bill_requested_at IS NOT NULL) AS pidio_la_cuenta, s.kitchen_status AS cocina
             FROM sales s
             JOIN dining_tables t ON t.id = s.table_id
             LEFT JOIN dining_areas a ON a.id = t.area_id
             LEFT JOIN employees w ON w.id = s.waiter_id
             LEFT JOIN employees e ON e.id = s.employee_id
            WHERE s.company_id = :cid AND s.status IN ('espera', 'borrador') ${enSucursales(ids, "s.warehouse_id")}
            ORDER BY s.created_at LIMIT 40`,
          { replacements: { cid: req.company_id }, type: QT.SELECT }),
        sequelize.query(
          `SELECT COUNT(*)::int AS n FROM table_orders WHERE company_id = :cid AND status = 'pendiente' ${enSucursales(ids, "warehouse_id")}`,
          { replacements: { cid: req.company_id }, type: QT.SELECT }).catch(() => [{ n: 0 }]),
      ]);
      return { mesas_abiertas: mesas.length, mesas, pedidos_qr_esperando: qr[0]?.n || 0 };
    },
  },
  {
    nombre: "comandas_cocina",
    descripcion: "Comandas en cocina ahora: cuántas nuevas, en preparación y listas sin entregar, y las que más llevan esperando (minutos), con su mesa o etiqueta.",
    parametros: { sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["kitchen.view", "tables.view"],
    modulo: "cocina_enabled",
    async ejecutar(req, args) {
      const wid = await sucursal(req, args);
      const ids = wid ? [wid] : await idsSucursales(req);
      const filas = await sequelize.query(
        `SELECT k.status AS estado, COALESCE(t.name, k.label) AS mesa_o_etiqueta, k.round_no AS ronda,
                ROUND(EXTRACT(EPOCH FROM (NOW() - k.created_at)) / 60)::int AS minutos_esperando
           FROM kitchen_tickets k
           JOIN sales s ON s.id = k.sale_id
           LEFT JOIN dining_tables t ON t.id = k.table_id
          WHERE k.company_id = :cid AND k.status IN ('nueva', 'preparando', 'lista')
            AND s.status NOT IN ('anulado', 'devuelto')
            AND k.created_at > NOW() - INTERVAL '18 hours'
            AND (k.status <> 'lista' OR k.status_at > NOW() - INTERVAL '2 hours')
            ${enSucursales(ids, "k.warehouse_id")}
          ORDER BY k.created_at LIMIT 60`,
        { replacements: { cid: req.company_id }, type: QT.SELECT }
      );
      const cuenta = (e) => filas.filter(f => f.estado === e).length;
      return { nuevas: cuenta("nueva"), preparando: cuenta("preparando"), listas_sin_entregar: cuenta("lista"), las_que_mas_esperan: filas.filter(f => f.estado !== "lista").slice(0, 10) };
    },
  },
);

// ── Módulos extra (20-11-2026): comisiones, propinas, agenda y cobranza. Cada consulta existe
// solo para la empresa que tiene el módulo (`modulo`) y pide los mismos permisos que su pantalla.
HERRAMIENTAS.push(
  {
    nombre: "comisiones",
    descripcion: "Comisiones por vendedor en un período: lo vendido, lo cobrado, la comisión ganada, lo que falta cobrar de sus ventas y el saldo que se le debe (ganado menos pagado).",
    parametros: { ...PARAM_RANGO },
    permisos: ["commissions.view"],
    modulo: "comisiones_enabled",
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const tc = await buildTenantContext(req);
      const r = await require("../commissions").report({ company_id: req.company_id, date_from: desde, date_to: hasta, warehouse_id: await sucursal(req, args), wh: tc.wh });
      return {
        periodo: { desde, hasta },
        totales: r.totals,
        vendedores: (r.data || []).slice(0, 20).map(s => ({ vendedor: s.name, codigo: s.code, porcentaje: s.commission_pct, ventas: s.ventas, vendido: s.vendido, cobrado: s.cobrado, comision_del_periodo: s.comision, por_cobrar: s.por_cobrar, pagado: s.pagado, saldo_que_se_le_debe: s.saldo })),
      };
    },
  },
  {
    nombre: "propinas",
    descripcion: "Propinas de un período: cuánto le tocó a cada persona, lo pagado y el saldo que se le debe; el pozo por repartir y el modo de reparto (mesonero o pozo).",
    parametros: { ...PARAM_RANGO },
    permisos: ["tips.view"],
    modulo: "propinas_enabled",
    async ejecutar(req, args) {
      const { desde, hasta } = rango(args);
      const tc = await buildTenantContext(req);
      const r = await require("../tips").report({ company_id: req.company_id, date_from: desde, date_to: hasta, warehouse_id: await sucursal(req, args), wh: tc.wh });
      return {
        periodo: { desde, hasta },
        modo_de_reparto: r.modo,
        totales: r.totals,
        pozo: r.pool,
        sin_persona_asignada: r.sin_persona,
        personas: (r.data || []).slice(0, 20).map(s => ({ persona: s.name, cuentas_atendidas: s.cuentas, propina_del_periodo: s.periodo, por_cobrar: s.por_cobrar, pagado: s.pagado, saldo_que_se_le_debe: s.saldo })),
      };
    },
  },
  {
    nombre: "agenda_citas",
    descripcion: "Citas de un día (por defecto hoy): hora, cliente, profesional o puesto, servicios y estado (pendiente, confirmada, en curso, terminada, cancelada, no vino), y las citas terminadas que faltan por cobrar.",
    parametros: { fecha: { type: "string", description: "Día YYYY-MM-DD. Si no se indica, hoy." }, sucursal_id: PARAM_RANGO.sucursal_id },
    permisos: ["agenda.own", "agenda.view", "agenda.book"],
    modulo: "citas_enabled",
    async ejecutar(req, args) {
      const fecha = fecha_(args.fecha) || hoy();
      const wid = await sucursal(req, args);
      const ids = wid ? [wid] : (await idsSucursales(req)) ?? (await sequelize.query(
        `SELECT id FROM warehouses WHERE company_id = :cid AND active IS NOT FALSE AND sells IS NOT FALSE ORDER BY id`,
        { replacements: { cid: req.company_id }, type: QT.SELECT })).map(w => w.id);
      const citas = require("../agenda/citas");
      const todas = [], porCobrar = [];
      for (const w of ids.slice(0, 3)) {
        todas.push(...await citas.listarDia(req, w, fecha));
        porCobrar.push(...await citas.porCobrar(req, w));
      }
      const recursos = [...new Set([...todas, ...porCobrar].map(c => c.resource_id).filter(Boolean))];
      const nombres = recursos.length ? Object.fromEntries((await sequelize.query(
        `SELECT id, name FROM agenda_resources WHERE company_id = :cid AND id IN (:ids)`,
        { replacements: { cid: req.company_id, ids: recursos }, type: QT.SELECT })).map(r => [r.id, r.name])) : {};
      const cita = (c) => ({
        inicio: c.starts_at, fin: c.ends_at, cliente: c.customer_name, profesional: nombres[c.resource_id] || null,
        servicios: (c.items || []).map(i => i.name).join(", "), estado: c.status, cobro: c.payment_state, total: c.sale_total ?? null,
      });
      const estados = todas.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {});
      return { fecha, total_citas: todas.length, por_estado: estados, citas: todas.slice(0, 30).map(cita), terminadas_por_cobrar: porCobrar.slice(0, 15).map(cita) };
    },
  },
  {
    nombre: "cobranza_sectores",
    descripcion: "Cobranza por sectores: cada sector con su sucursal, sus cobradores, cuántos clientes tiene, cuántos deben y cuánto deben en total. Un cobrador ve solo sus sectores.",
    parametros: {},
    permisos: ["cobranza.view", "cobranza.manage"],
    modulo: "cobranza_enabled",
    async ejecutar(req) {
      const r = await require("../cobranza").listarSectores(req, {});
      const sectores = (r.data || []).filter(s => s.active !== false).map(s => ({
        sector: s.name, sucursal: s.warehouse_name, cobradores: (s.employees || []).map(e => e.name || e.full_name).filter(Boolean).join(", "),
        clientes: s.clientes, clientes_con_deuda: s.con_deuda, deuda: s.deuda,
      }));
      return { sectores: sectores.slice(0, 30), deuda_total: Math.round(sectores.reduce((t, s) => t + (s.deuda || 0), 0) * 100) / 100, clientes_sin_sector: typeof r.sin_sector === "object" ? r.sin_sector : r.sin_sector ?? null };
    },
  },
);

// ── Farmacia (20-11-2026). El libro de control asocia pacientes con medicamentos (también
// psicotrópicos): es dato de salud y NO sale hacia el proveedor de IA. Van cantidades,
// medicamentos, médicos, quién autorizó y qué falta (foto, número); el paciente se ve en
// Reportes, en el libro.
HERRAMIENTAS.push({
  nombre: "farmacia_recipes",
  descripcion: "Libro de control de récipes y controlados de un período, SIN datos de pacientes: cuántos récipes y controlados se despacharon, por medicamento y principio activo, por médico, quién autorizó, y cuáles quedaron sin foto o sin número de récipe.",
  parametros: {
    ...PARAM_RANGO,
    tipo: { type: "string", enum: ["todos", "controlado", "recipe"], description: "Solo controlados, solo con récipe, o todos (por defecto)." },
  },
  permisos: ["pharmacy.reports"],
  modulo: "farmacia_enabled",
  async ejecutar(req, args) {
    const { desde, hasta } = rango(args);
    const ctx = await buildTenantContext(req);
    const filas = await reportes.prescriptionsReport({
      ...ctx, from: desde, to: hasta, warehouse_id: await sucursal(req, args),
      prescription_type: ["controlado", "recipe"].includes(args.tipo) ? args.tipo : undefined,
    });
    const recipes = new Map();
    for (const f of filas) if (!recipes.has(f.prescription_id)) recipes.set(f.prescription_id, f);
    const contar = (lista, clave) => Object.entries(lista.reduce((m, x) => { const k = clave(x) || "Sin dato"; m[k] = (m[k] || 0) + 1; return m; }, {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nombre, veces]) => ({ nombre, veces }));
    const porMedicamento = Object.values(filas.reduce((m, f) => {
      const k = f.product_name;
      m[k] = m[k] || { medicamento: k, principio_activo: f.active_ingredient, tipo: f.prescription_type, despachos: 0, cantidad: 0 };
      m[k].despachos += 1; m[k].cantidad += f.quantity;
      return m;
    }, {})).sort((a, b) => b.despachos - a.despachos).slice(0, 15);
    const lista = [...recipes.values()];
    return {
      periodo: { desde, hasta },
      recipes_registrados: lista.length,
      lineas_despachadas: filas.length,
      controlados: filas.filter(f => f.prescription_type === "controlado").length,
      con_recipe: filas.filter(f => f.prescription_type === "recipe").length,
      sin_foto: lista.filter(r => !r.photo_filename).length,
      sin_numero_de_recipe: lista.filter(r => !r.prescription_number).length,
      autorizados_con_pin: lista.filter(r => r.approved_by).length,
      por_medicamento: porMedicamento,
      por_medico: contar(lista, r => r.doctor_name),
      autorizo: contar(lista.filter(r => r.approved_by), r => r.approver_name),
      ultimos: lista.slice(0, 10).map(r => ({
        factura: r.invoice_number, fecha: r.sale_date, medico: r.doctor_name, autorizo: r.approver_name || null,
        tiene_foto: !!r.photo_filename, numero_recipe: r.prescription_number || null,
        medicamentos: filas.filter(f => f.prescription_id === r.prescription_id).map(f => f.product_name).join(", "),
      })),
      nota: "Los datos de los pacientes no se muestran aquí: están en Reportes, libro de control de récipes.",
    };
  },
});

// Sin permisos en la lista = cualquiera que tenga el asistente (las tasas, por ejemplo).
const puede = (req, h) => !h.permisos.length || h.permisos.some(p => hasPermission(req.employee?.permissions, p));

// Definiciones en el formato de "tools" (OpenAI / DeepSeek) de lo que este usuario puede usar.
// `flags`: los extras encendidos de la empresa; una consulta de mesas no se ofrece sin Restaurante.
function disponibles(req, flags = {}) {
  return HERRAMIENTAS.filter(h => puede(req, h) && (!h.modulo || flags[h.modulo])).map(h => ({
    type: "function",
    function: {
      name: h.nombre,
      description: h.descripcion,
      parameters: { type: "object", properties: h.parametros, required: h.requeridos || [] },
    },
  }));
}

// El mismo req sin la sucursal de trabajo marcada en la barra (X-Sucursales): ve todas las
// sucursales a las que el usuario TIENE ACCESO. Las cachés de scopeWarehouseIds se anulan en la
// copia para que no hereden el recorte del original.
function sinFiltroDeSucursal(req) {
  const headers = { ...(req.headers || {}) };
  delete headers["x-sucursales"];
  return Object.assign(Object.create(req), { headers, _scopeWarehouseIds: undefined, _scopeWarehouseIdsAll: undefined });
}

async function ejecutar(req, nombre, argsTexto, flags = {}) {
  const h = HERRAMIENTAS.find(x => x.nombre === nombre);
  if (!h || (h.modulo && !flags[h.modulo])) return { error: "Esa consulta no existe." };
  if (!puede(req, h)) return { error: "El usuario no tiene permiso para esta consulta. Dile que se lo pida al administrador de la tienda." };
  let args = {};
  try { args = argsTexto ? JSON.parse(argsTexto) : {}; } catch { return { error: "Argumentos inválidos." }; }
  // Preguntar por otra sucursal que no es la de trabajo: si el usuario tiene acceso a ella, se
  // consulta (en el chat se pregunta por "Barquisimeto" sin cambiar la barra de arriba). Si no
  // tiene acceso, sigue el recorte normal y la consulta responde que no puede.
  let reqUso = req;
  const pedida = parseInt(args?.sucursal_id, 10);
  if (pedida) {
    const libre = sinFiltroDeSucursal(req);
    const accesibles = await scopeWarehouseIds(libre, { includeDeposits: true });
    if (accesibles === null || accesibles.includes(pedida)) reqUso = libre;
  }
  try {
    return limpiar(await h.ejecutar(reqUso, args || {}));
  } catch (err) {
    if (err.isOperational) return { error: err.message };
    console.error(`Asistente: herramienta ${nombre}`, err);
    return { error: "No se pudo consultar ese dato en este momento." };
  }
}

module.exports = { disponibles, ejecutar, hoy, limpiar, sinFiltroDeSucursal };
