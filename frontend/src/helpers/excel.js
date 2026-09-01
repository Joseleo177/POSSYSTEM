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

// ── Exportadores por módulo ──────────────────────────────────

export function buildSalesExcel(data, range) {
  download(buildWb([
    {
      name: "Resumen",
      rows: [data.summary],
      headers: [
        { key: "total_sales",    label: "Total Facturas" },
        { key: "total_revenue",  label: "Ingresos ($)" },
        { key: "avg_ticket",     label: "Ticket Promedio ($)" },
        { key: "max_sale",       label: "Venta Máxima ($)" },
        { key: "pending_count",  label: "Facturas Pendientes" },
        { key: "pending_amount", label: "Monto Pendiente ($)" },
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
  ]), `Ventas_${range.from}_${range.to}${sufijoFranja(range)}${sufijoSerie(range)}`);
}

export function buildInventoryExcel(data) {
  download(buildWb([
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
  download(buildWb([
    {
      name: "Resumen",
      rows: [data.summary],
      headers: [
        { key: "total_revenue",      label: "Ingresos ($)" },
        { key: "total_cost",         label: "Costo Total ($)" },
        { key: "total_margin",       label: "Utilidad Bruta ($)" },
        { key: "avg_margin_pct",     label: "Margen Promedio (%)" },
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
  ]), `Margenes_${range.from}_${range.to}${sufijoFranja(range)}`);
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

  // Cada diario aporta su monto en su propia moneda; el equivalente en base solo se agrega
  // cuando el diario no está ya en base, para no repetir la misma cifra dos veces.
  const dayHeaders = [{ key: "fecha", label: "Fecha" }];
  for (const j of journals) {
    dayHeaders.push({ key: `j${j.id}`, label: `${j.name} (${j.currency_symbol})` });
    if (!j.is_base) dayHeaders.push({ key: `j${j.id}_base`, label: `${j.name} (Ref.)` });
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
        bank_name: j.bank_name || "",
        currency_symbol: j.currency_symbol,
        tx_count: data.totals?.cells?.[j.id]?.tx_count || 0,
        amount_journal: data.totals?.cells?.[j.id]?.amount_journal || 0,
        amount_base: data.totals?.cells?.[j.id]?.amount_base || 0,
      })),
      headers: [
        { key: "name",            label: "Diario" },
        { key: "bank_name",       label: "Banco" },
        { key: "currency_symbol", label: "Moneda" },
        { key: "tx_count",        label: "Cobros" },
        { key: "amount_journal",  label: "Total (moneda del diario)" },
        { key: "amount_base",     label: "Total (Ref.)" },
      ],
    },
  ]), `DiariosPago_${range.from}_${range.to}${sufijoFranja(range)}`);
}
