import * as XLSX from "xlsx";

// ── Descarga un workbook como .xlsx ──────────────────────────
function download(wb, filename) {
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── Hoja desde array de objetos ──────────────────────────────
function makeSheet(rows, headers) {
  if (!rows || rows.length === 0) return XLSX.utils.aoa_to_sheet([["Sin datos"]]);

  const cols = headers ? headers.map(h => h.label) : Object.keys(rows[0]);
  const keys = headers ? headers.map(h => h.key) : Object.keys(rows[0]);

  const data = [
    cols,
    ...rows.map(r => keys.map(k => {
      const v = r[k];
      if (v == null) return "";
      const n = parseFloat(v);
      return (!isNaN(n) && isFinite(v)) ? n : v;
    })),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Ancho automático de columnas
  const colWidths = cols.map((c, ci) => {
    const maxLen = Math.max(
      c.length,
      ...rows.map(r => String(r[keys[ci]] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws["!cols"] = colWidths;

  return ws;
}

function buildWb(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows, headers }) => {
    XLSX.utils.book_append_sheet(wb, makeSheet(rows, headers), name.slice(0, 31));
  });
  return wb;
}

// Franja horaria en el nombre del archivo: dos exportaciones del mismo rango con recortes
// distintos se pisarían en la carpeta de descargas, y sin abrirlas no habría cómo saber
// cuál es cuál. Los dos puntos no son válidos en un nombre de archivo en Windows.
const sufijoFranja = (range) =>
  range?.hour_from && range?.hour_to
    ? `_${String(range.hour_from).replace(":", "")}-${String(range.hour_to).replace(":", "")}`
    : "";

// Serie en el nombre del archivo, por lo mismo que la franja. Se limpia de todo lo que no
// sea alfanumérico: los nombres de serie llevan barras y espacios que no van en un archivo.
const sufijoSerie = (range) =>
  range?.serie_name ? `_${String(range.serie_name).replace(/[^A-Za-z0-9]+/g, "-").slice(0, 20)}` : "";

// Sucursal en el nombre del archivo, mismo criterio que la serie.
const sufijoSucursal = (range) =>
  range?.warehouse_name ? `_${String(range.warehouse_name).replace(/[^A-Za-z0-9]+/g, "-").slice(0, 20)}` : "";

// ── Exportadores por módulo ──────────────────────────────────

export function buildSalesExcel(data, range) {
  download(buildWb([
    {
      name: "Resumen",
      rows: [data.summary],
      headers: [
        { key: "total_sales",    label: "Total Facturas" },
        { key: "total_revenue",  label: "Ingresos ($)" },
        { key: "paid_same_day_amount", label: "Cobrado de Ventas del Día ($)" },
        { key: "paid_older_amount",    label: "Cobrado de Ventas Anteriores ($)" },
        { key: "pending_count",  label: "Facturas Pendientes" },
        { key: "pending_amount", label: "Monto Pendiente ($)" },
      ],
    },
    {
      name: "Cobros Ventas Anteriores",
      rows: data.older_payments || [],
      headers: [
        { key: "invoice_number", label: "Factura" },
        { key: "customer_name",  label: "Cliente" },
        { key: "sale_day",       label: "Fecha de la Venta" },
        { key: "days",           label: "Días Después" },
        { key: "count",          label: "Cobros" },
        { key: "amount",         label: "Cobrado ($)" },
      ],
    },
    {
      name: "Por Día",
      rows: data.by_day,
      headers: [
        { key: "day",     label: "Fecha" },
        { key: "count",   label: "Ventas" },
        { key: "revenue", label: "Ingresos ($)" },
      ],
    },
    {
      name: "Métodos de Pago",
      rows: data.by_method,
      // Las dos monedas en columnas separadas: la propia es contra la que se cuadra el banco,
      // la base es la única que se puede sumar entre diarios de distinta moneda.
      headers: [
        { key: "method_name",     label: "Diario / Método" },
        { key: "method_type",     label: "Tipo" },
        { key: "count",           label: "Cobros" },
        { key: "currency_symbol", label: "Moneda" },
        { key: "total_journal",   label: "Total en su moneda" },
        { key: "total",           label: "Total ($)" },
      ],
    },
    {
      name: "Por Vendedor",
      rows: data.by_employee,
      headers: [
        { key: "employee_name", label: "Vendedor" },
        { key: "count",         label: "Ventas" },
        { key: "revenue",       label: "Ingresos ($)" },
        { key: "avg_ticket",    label: "Ticket Promedio ($)" },
      ],
    },
    {
      name: "Por Hora",
      rows: data.by_hour,
      headers: [
        { key: "hour",    label: "Hora" },
        { key: "count",   label: "Ventas" },
        { key: "revenue", label: "Ingresos ($)" },
      ],
    },
  ]), `Ventas_${range.from}_${range.to}${sufijoFranja(range)}${sufijoSerie(range)}${sufijoSucursal(range)}`);
}

export function buildInventoryExcel(data) {
  download(buildWb([
    {
      name: "Valorización",
      rows: data.valuation,
      headers: [
        { key: "name",          label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "stock",         label: "Stock" },
        { key: "unit",          label: "Unidad" },
        { key: "cost_price",    label: "Costo Unitario ($)" },
        { key: "value_cost",    label: "Capital al Costo ($)" },
        { key: "value_sale",    label: "Valor a Precio Venta ($)" },
      ],
    },
    {
      name: "Stock Crítico",
      rows: data.critical_stock,
      headers: [
        { key: "name",          label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "stock",         label: "Stock Actual" },
        { key: "min_stock",     label: "Stock Mínimo" },
        { key: "needed",        label: "Unidades Faltantes" },
        { key: "unit",          label: "Unidad" },
      ],
    },
    {
      name: "Sin Stock",
      rows: data.zero_stock,
      headers: [
        { key: "name",          label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "min_stock",     label: "Stock Mínimo" },
        { key: "unit",          label: "Unidad" },
      ],
    },
    {
      name: "Alta Rotación",
      rows: data.top_rotation,
      headers: [
        { key: "name",       label: "Producto" },
        { key: "units_sold", label: "Unidades Vendidas" },
        { key: "revenue",    label: "Ingresos ($)" },
        { key: "stock",      label: "Stock Actual" },
        { key: "unit",       label: "Unidad" },
      ],
    },
    {
      name: "Sin Movimiento",
      rows: data.low_rotation,
      headers: [
        { key: "name",          label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "stock",         label: "Stock" },
        { key: "value_locked",  label: "Capital Inmovilizado ($)" },
      ],
    },
    {
      name: "Por Categoría",
      rows: data.by_category,
      headers: [
        { key: "category_name", label: "Categoría" },
        { key: "product_count", label: "Productos" },
        { key: "total_units",   label: "Unidades Totales" },
        { key: "value_cost",    label: "Valor Costo ($)" },
        { key: "value_sale",    label: "Valor Venta ($)" },
      ],
    },
  ]), `Inventario_${new Date().toISOString().slice(0, 10)}`);
}

export function buildMarginsExcel(data, range) {
  // La base va en el resumen y en el nombre del archivo: los dos Excel se parecen mucho y
  // dicen cosas distintas.
  const cobro = data.basis === "cobro";
  download(buildWb([
    {
      name: "Resumen",
      rows: [{ ...data.summary, base: cobro ? "Por cobro (gestión, no fiscal)" : "Por venta" }],
      headers: [
        { key: "base",               label: "Base" },
        ...(cobro ? [
          { key: "cobrado",          label: "Cobros del Período ($)" },
          { key: "vuelto",           label: "Vuelto Entregado ($)" },
          { key: "ajustes",          label: "Saldo a Favor y Sobrantes ($)" },
        ] : []),
        { key: "total_revenue",      label: cobro ? "Ingreso Cobrado ($)" : "Total Vendido ($)" },
        { key: "sin_costo",          label: "Sin Costo Cargado ($)" },
        { key: "total_cost",         label: "Costo Total ($)" },
        ...(cobro ? [{ key: "forgiven_cost", label: "Mercancía Exonerada ($)" }] : []),
        { key: "total_margin",       label: "Utilidad Bruta ($)" },
        { key: "avg_margin_pct",     label: "Margen (%)" },
        { key: "products_with_cost", label: "Productos con Costo" },
      ],
    },
    {
      name: "Por Producto",
      rows: data.by_product,
      headers: [
        { key: "product_name",  label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "sales_count",   label: "Ventas" },
        { key: "total_qty",     label: "Uds. Vendidas" },
        { key: "revenue",       label: "Ingresos ($)" },
        { key: "total_cost",    label: "Costo ($)" },
        { key: "gross_margin",  label: "Utilidad ($)" },
        { key: "margin_pct",    label: "Margen (%)" },
      ],
    },
    {
      name: "Por Categoría",
      rows: data.by_category,
      headers: [
        { key: "category_name", label: "Categoría" },
        { key: "product_count", label: "Productos" },
        { key: "revenue",       label: "Ingresos ($)" },
        { key: "total_cost",    label: "Costo ($)" },
        { key: "gross_margin",  label: "Utilidad ($)" },
        { key: "margin_pct",    label: "Margen (%)" },
      ],
    },
    {
      name: "Bajo Margen",
      rows: data.bottom_margin,
      headers: [
        { key: "product_name", label: "Producto" },
        { key: "revenue",      label: "Ingresos ($)" },
        { key: "gross_margin", label: "Utilidad ($)" },
        { key: "margin_pct",   label: "Margen (%)" },
      ],
    },
    {
      name: "Sin Costo",
      rows: data.sin_costo || [],
      headers: [
        { key: "product_name",  label: "Producto" },
        { key: "category_name", label: "Categoría" },
        { key: "sales_count",   label: "Ventas" },
        { key: "revenue",       label: "Ingresos ($)" },
      ],
    },
  ]), `Margenes_${cobro ? "cobro_" : ""}${range.from}_${range.to}${sufijoFranja(range)}`);
}

export function buildCustomersExcel(data, range) {
  download(buildWb([
    {
      name: "Top Clientes",
      rows: data.top_customers,
      headers: [
        { key: "name",           label: "Cliente" },
        { key: "phone",          label: "Teléfono" },
        { key: "rif",            label: "RIF" },
        { key: "purchase_count", label: "Compras" },
        { key: "total_spent",    label: "Total Gastado ($)" },
        { key: "avg_ticket",     label: "Ticket Promedio ($)" },
        { key: "last_purchase",  label: "Última Compra" },
      ],
    },
    {
      name: "Clientes Inactivos",
      rows: data.inactive_customers,
      headers: [
        { key: "name",            label: "Cliente" },
        { key: "phone",           label: "Teléfono" },
        { key: "total_purchases", label: "Compras Totales" },
        { key: "lifetime_value",  label: "Valor Total ($)" },
        { key: "days_inactive",   label: "Días sin comprar" },
        { key: "last_purchase",   label: "Última Compra" },
      ],
    },
    {
      name: "Clientes Nuevos",
      rows: data.new_customers,
      headers: [
        { key: "name",           label: "Cliente" },
        { key: "phone",          label: "Teléfono" },
        { key: "first_purchase", label: "Primera Compra" },
        { key: "purchase_count", label: "Compras" },
        { key: "total_spent",    label: "Total Gastado ($)" },
      ],
    },
    {
      name: "Distribución Ticket",
      rows: data.ticket_distribution,
      headers: [
        { key: "range",   label: "Rango" },
        { key: "count",   label: "Cantidad" },
        { key: "revenue", label: "Ingresos ($)" },
      ],
    },
  ]), `Clientes_${range.from}_${range.to}`);
}

export function buildAuditExcel(data, range) {
  download(buildWb([
    {
      name: "Devoluciones",
      rows: data.returns_list,
      headers: [
        { key: "id",            label: "ID" },
        { key: "sale_id",       label: "Factura" },
        { key: "customer_name", label: "Cliente" },
        { key: "employee_name", label: "Empleado" },
        { key: "reason",        label: "Motivo" },
        { key: "total",         label: "Monto ($)" },
        { key: "created_at",    label: "Fecha" },
      ],
    },
    {
      name: "Por Empleado",
      rows: data.by_employee,
      headers: [
        { key: "employee_name",    label: "Empleado" },
        { key: "sale_count",       label: "Ventas" },
        { key: "revenue",          label: "Ingresos ($)" },
        { key: "avg_ticket",       label: "Ticket Promedio ($)" },
        { key: "max_sale",         label: "Venta Máxima ($)" },
        { key: "total_discounts",  label: "Descuentos Otorgados ($)" },
        { key: "discounted_sales", label: "Ventas con Descuento" },
      ],
    },
    {
      name: "Ventas con Descuento",
      rows: data.discounts,
      headers: [
        { key: "id",              label: "ID Venta" },
        { key: "customer_name",   label: "Cliente" },
        { key: "employee_name",   label: "Empleado" },
        { key: "total",           label: "Total ($)" },
        { key: "discount_amount", label: "Descuento ($)" },
        { key: "created_at",      label: "Fecha" },
      ],
    },
  ]), `Auditoria_${range.from}_${range.to}`);
}

export function buildReceivablesExcel(data) {
  download(buildWb([
    {
      name: "Resumen",
      rows: [data.summary],
      headers: [
        { key: "total_invoices",  label: "Total Facturas" },
        { key: "total_billed",    label: "Total Facturado ($)" },
        { key: "total_balance",   label: "Por Cobrar ($)" },
        { key: "total_collected", label: "Cobrado ($)" },
      ],
    },
    {
      name: "Por Cliente",
      rows: data.by_customer,
      headers: [
        { key: "customer_name",  label: "Cliente" },
        { key: "phone",          label: "Teléfono" },
        { key: "rif",            label: "RIF" },
        { key: "invoice_count",  label: "Facturas" },
        { key: "total_billed",   label: "Total Facturado ($)" },
        { key: "balance",        label: "Saldo Pendiente ($)" },
        { key: "oldest_invoice", label: "Factura más Antigua" },
        { key: "latest_invoice", label: "Última Factura" },
      ],
    },
    {
      name: "Antigüedad",
      rows: [data.aging],
      headers: [
        { key: "d0_30_count",     label: "0-30 días (cant.)" },
        { key: "d0_30_amount",    label: "0-30 días ($)" },
        { key: "d31_60_count",    label: "31-60 días (cant.)" },
        { key: "d31_60_amount",   label: "31-60 días ($)" },
        { key: "d60_plus_count",  label: "+60 días (cant.)" },
        { key: "d60_plus_amount", label: "+60 días ($)" },
      ],
    },
  ]), `CuentasCobrar_${new Date().toISOString().slice(0, 10)}`);
}

export function buildPurchasesExcel(data, range) {
  download(buildWb([
    {
      name: "Resumen",
      rows: [data.summary],
      headers: [
        { key: "total_orders", label: "Total Órdenes" },
        { key: "total_cost",   label: "Costo Total ($)" },
        { key: "avg_order",    label: "Promedio por Orden ($)" },
        { key: "max_order",    label: "Orden Máxima ($)" },
      ],
    },
    {
      name: "Por Proveedor",
      rows: data.by_supplier,
      headers: [
        { key: "supplier_name", label: "Proveedor" },
        { key: "order_count",   label: "Órdenes" },
        { key: "total_cost",    label: "Costo Total ($)" },
      ],
    },
    {
      name: "Por Día",
      rows: data.by_day,
      headers: [
        { key: "day",   label: "Fecha" },
        { key: "count", label: "Órdenes" },
        { key: "cost",  label: "Costo ($)" },
      ],
    },
    {
      name: "Más Comprados",
      rows: data.top_products,
      headers: [
        { key: "product_name", label: "Producto" },
        { key: "order_count",  label: "Órdenes" },
        { key: "total_units",  label: "Unidades Recibidas" },
        { key: "total_cost",   label: "Costo Total ($)" },
      ],
    },
  ]), `Compras_${range.from}_${range.to}`);
}

// Cobros por día y diario. A diferencia del resto de exportadores, las columnas no son fijas:
// dependen de qué diarios tuvieron movimiento en el rango, así que las filas se aplanan aquí
// usando una clave por diario.
export function buildPaymentJournalsExcel(data, range) {
  const journals = data.journals || [];
  // En la vista por método cada columna es cuenta + método: el rótulo lleva los dos.
  const rotulo = (j) => j.method_name ? `${j.name} - ${j.method_name}` : j.name;

  // Cada diario aporta su monto en su propia moneda; el equivalente en base solo se agrega
  // cuando el diario no está ya en base, para no repetir la misma cifra dos veces.
  const dayHeaders = [{ key: "fecha", label: "Fecha" }];
  for (const j of journals) {
    dayHeaders.push({ key: `j${j.id}`, label: `${rotulo(j)} (${j.currency_symbol})` });
    if (!j.is_base) dayHeaders.push({ key: `j${j.id}_base`, label: `${rotulo(j)} (Ref.)` });
  }
  dayHeaders.push({ key: "total_base", label: "Total (Ref.)" });

  const flatten = (row) => {
    const out = { fecha: row.date, total_base: row.total_base };
    for (const j of journals) {
      const c = row.cells?.[j.id];
      out[`j${j.id}`] = c ? c.amount_journal : 0;
      if (!j.is_base) out[`j${j.id}_base`] = c ? c.amount_base : 0;
    }
    return out;
  };

  const dayRows = (data.days || []).map(flatten);
  // El total va como una fila más de la misma hoja: en Excel es lo que se espera al pie de
  // un cuadre, y así se puede comprobar la suma sin saltar de pestaña. Debajo, lo cargado a
  // mano y el neto, en el mismo orden que la pantalla —quien exporta el cuadre necesita las
  // tres líneas, no solo los cobros—.
  if (data.totals) dayRows.push(flatten({ ...data.totals, date: "TOTAL VENTAS" }));
  if (data.manual) {
    dayRows.push(flatten({ ...data.manual.incomes,  date: "+ INGRESOS MANUALES" }));
    dayRows.push(flatten({ ...data.manual.expenses, date: "- EGRESOS MANUALES" }));
    dayRows.push(flatten({ ...data.manual.net,      date: "MOVIMIENTO NETO" }));
  }

  download(buildWb([
    { name: "Por Día", rows: dayRows, headers: dayHeaders },
    {
      name: "Por Diario",
      rows: journals.map(j => ({
        name: j.name,
        method_name: j.method_name || "",
        bank_name: j.bank_name || "",
        currency_symbol: j.currency_symbol,
        tx_count: data.totals?.cells?.[j.id]?.tx_count || 0,
        amount_journal: data.totals?.cells?.[j.id]?.amount_journal || 0,
        amount_base: data.totals?.cells?.[j.id]?.amount_base || 0,
      })),
      headers: [
        { key: "name",            label: "Diario" },
        ...(data.by === "method" ? [{ key: "method_name", label: "Método" }] : []),
        { key: "bank_name",       label: "Banco" },
        { key: "currency_symbol", label: "Moneda" },
        { key: "tx_count",        label: "Cobros" },
        { key: "amount_journal",  label: "Total (moneda del diario)" },
        { key: "amount_base",     label: "Total (Ref.)" },
      ],
    },
  ]), `DiariosPago_${range.from}_${range.to}${sufijoFranja(range)}`);
}

// Ingresos y egresos del período: las tres hojas del resumen de finanzas que las tiendas
// llevaban a mano (resumen, ingresos por día y forma de pago, egresos uno por uno).
export function buildFinanceExcel(data, range) {
  const base  = data.base_symbol || "Ref.";
  const local = data.local_symbol || "Bs.";
  const s = data.summary || {};
  const cols = data.income?.columns || [];
  const tot  = data.income?.totals || {};
  const simbolo = (c) => (c.is_base ? base : c.currency_symbol);
  const TIPO = { compra: "COMPRA", gasto: "GASTO", devolucion: "DEVOLUCIÓN" };
  const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

  const resumen = [
    { concepto: "Total ingresos", moneda_local: r2(s.income_local), moneda_base: r2(s.income_base) },
    { concepto: "Total egresos", moneda_local: "", moneda_base: r2(s.expense_base) },
    { concepto: "Resultado", moneda_local: "", moneda_base: r2(s.net_base) },
    { concepto: "% egresos sobre ingresos", moneda_local: "", moneda_base: s.expense_ratio == null ? "" : r2(s.expense_ratio * 100) },
    { concepto: `Tasa promedio (${local} por ${base})`, moneda_local: s.avg_rate ? r2(s.avg_rate) : "", moneda_base: "" },
    { concepto: "", moneda_local: "", moneda_base: "" },
    { concepto: "INGRESOS POR FORMA DE PAGO", moneda_local: "", moneda_base: "" },
    ...cols.map(c => ({
      concepto: `${c.label} (${simbolo(c)})`,
      moneda_local: r2(tot.cells?.[c.id]?.amount_journal),
      moneda_base: r2(tot.cells?.[c.id]?.amount_base),
    })),
    ...((tot.other?.tx_count || 0) > 0 ? [{ concepto: "Otros ingresos", moneda_local: r2(tot.other.amount_local), moneda_base: r2(tot.other.amount_base) }] : []),
    { concepto: "", moneda_local: "", moneda_base: "" },
    { concepto: "EGRESOS POR FORMA DE PAGO", moneda_local: "", moneda_base: "" },
    ...(data.expenses?.by_method || []).map(m => ({
      concepto: `${m.method_name} (${m.is_base ? base : m.currency_symbol})`,
      moneda_local: r2(m.amount_journal),
      moneda_base: r2(m.amount_base),
    })),
    { concepto: "", moneda_local: "", moneda_base: "" },
    { concepto: "EGRESOS POR TIPO", moneda_local: "", moneda_base: "" },
    ...Object.entries(data.expenses?.by_kind || {}).map(([k, v]) => ({
      concepto: `${TIPO[k] || k} (${v.count})`, moneda_local: "", moneda_base: r2(v.amount_base),
    })),
  ];

  const dayHeaders = [
    { key: "fecha", label: "Fecha" },
    { key: "tasa", label: "Tasa" },
    ...cols.map(c => ({ key: `c${c.id}`, label: `${c.label} (${simbolo(c)})` })),
    ...((tot.other?.tx_count || 0) > 0 ? [{ key: "otros", label: `Otros ingresos (${base})` }] : []),
    { key: "total_local", label: `Total ${local}` },
    { key: "total_base", label: `Total ${base}` },
  ];
  const fila = (d, etiqueta) => {
    const out = { fecha: etiqueta || d.date.split("-").reverse().join("/"), tasa: d.rate ? r2(d.rate) : "", otros: r2(d.other?.amount_base), total_local: r2(d.total_local), total_base: r2(d.total_base) };
    for (const c of cols) out[`c${c.id}`] = r2(d.cells?.[c.id]?.amount_journal);
    return out;
  };
  const dias = (data.income?.days || []).map(d => fila(d));
  if (dias.length) dias.push(fila({ ...tot, rate: s.avg_rate }, "TOTAL"));

  const egresos = (data.expenses?.rows || []).map(e => ({
    fecha: e.date.split("-").reverse().join("/"),
    rif: e.rif || "N/A",
    tipo_doc: e.doc_type || "",
    nro_doc: e.doc_number || e.doc_text || "",
    tipo: TIPO[e.kind] || e.kind,
    descripcion: e.description || "",
    categoria: e.category_name || "",
    moneda: e.is_base ? base : e.currency_symbol,
    importe: r2(e.amount_journal),
    tasa: e.is_base ? "" : r2(e.rate),
    monto_base: r2(e.amount_base),
    pct: r2(e.share * 100),
    forma_pago: e.method_name || "",
    banco: e.bank_name || e.journal_name || "",
  }));
  if (egresos.length) egresos.push({ fecha: "TOTAL", monto_base: r2(s.expense_base), pct: 100 });

  download(buildWb([
    { name: "Resumen", rows: resumen, headers: [
      { key: "concepto", label: "Concepto" },
      { key: "moneda_local", label: `Monto (${local} / moneda de la caja)` },
      { key: "moneda_base", label: `Monto (${base})` },
    ] },
    { name: "Ingresos", rows: dias, headers: dayHeaders },
    { name: "Egresos", rows: egresos, headers: [
      { key: "fecha", label: "Fecha" },
      { key: "rif", label: "RIF" },
      { key: "tipo_doc", label: "Tipo doc." },
      { key: "nro_doc", label: "Nro. doc." },
      { key: "tipo", label: "Descripción" },
      { key: "descripcion", label: "Proveedor / concepto" },
      { key: "categoria", label: "Categoría" },
      { key: "moneda", label: "Moneda" },
      { key: "importe", label: "Importe" },
      { key: "tasa", label: "Tasa" },
      { key: "monto_base", label: `Monto (${base})` },
      { key: "pct", label: "% del total" },
      { key: "forma_pago", label: "Forma de pago" },
      { key: "banco", label: "Banco / caja" },
    ] },
  ]), `IngresosEgresos_${range.from}_${range.to}${sufijoSucursal(range)}`);
}
