// fmtDateShort para el período (el rango son días, no instantes) y fmtDate para el sello de
// generación, donde la hora sí distingue dos copias del mismo reporte.
import { fmtMoney, fmtDate, fmtDateShort } from ".";
import { REPORT_CSS, esc, fmtQty, pctOf as pct, reportHeader, openPrintFrame } from "./printReportBase";

// Reporte de ventas del período, en tamaño carta, para guardar como PDF o imprimir.
//
// Responde a la pregunta que el Excel deja a medias: qué se vendió y cuánto dejó cada cosa.
// El detalle va por PRODUCTO —unidades e ingreso bruto—, ordenado por lo que más dinero
// aportó, que es como se lee un cierre de mes. Los gráficos de la pantalla no se llevan al
// papel a propósito: en una hoja impresa lo que sirve es la tabla y los totales.
//
// Los importes van en moneda base, igual que el resto de los documentos: un reporte de un mes
// entero mezclaría tasas distintas si se expresara en bolívares. La excepción son los cobros
// por método, donde cada diario se muestra además en su propia moneda —cada cobro a la tasa
// del día en que se hizo—, porque es la cifra contra la que se cuadra el punto o el banco.

/**
 * @param {object} sales     respuesta de /reports/sales (summary, by_method, by_employee…)
 * @param {array}  productos filas de /reports/products → top_by_revenue
 * @param {object} range     { from, to } en ISO
 */
export function printSalesReport(sales, productos, range, companyInfo, baseCurrency) {
    // storeName se sigue usando en el <title> —el navegador lo propone como nombre del
    // archivo— y en el pie; el resto del encabezado lo arma reportHeader.
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const sym = baseCurrency?.symbol || "Ref.";
    const fmtP = n => fmtMoney(parseFloat(n || 0), sym);

    const s = sales?.summary || {};
    const filas = productos || [];

    // Los totales del detalle se suman de las propias filas: si el listado viniera recortado,
    // el pie diría exactamente lo que la tabla muestra y no una cifra que no cuadra con ella.
    const totalUnidades = filas.reduce((acc, p) => acc + parseFloat(p.total_qty || 0), 0);
    const totalIngresos = filas.reduce((acc, p) => acc + parseFloat(p.total_revenue || 0), 0);

    const filasHtml = filas.length ? filas.map((p, i) => `
        <tr>
            <td class="td-num">${i + 1}</td>
            <td class="item-name">${esc(p.product_name || "—")}</td>
            <td class="td-center">${fmtQty(p.total_qty)}</td>
            <td class="td-center">${p.sale_count != null ? esc(p.sale_count) : "—"}</td>
            <td class="td-right">${fmtP(p.avg_price)}</td>
            <td class="td-right td-total">${fmtP(p.total_revenue)}</td>
            <td class="td-center td-pct">${pct(p.total_revenue, totalIngresos)}</td>
        </tr>`).join("")
        : `<tr><td colspan="7" class="empty">Sin ventas registradas en el período</td></tr>`;

    // Sin recortes: con un total al pie, mostrar solo los primeros dejaría una suma que no
    // cuadra con las líneas de arriba.
    const empleados = sales?.by_employee || [];
    const metodos   = sales?.by_method   || [];

    const totalEmpleados = empleados.reduce((acc, e) => acc + parseFloat(e.revenue || 0), 0);
    const totalMetodos   = metodos.reduce((acc, m) => acc + parseFloat(m.total || 0), 0);
    const pendiente      = parseFloat(s.pending_amount || 0);
    const exonerado      = parseFloat(s.total_forgiven || 0);

    // Facturación por serie: con un punto de venta por caja es el corte con el que se cuadra
    // contra el correlativo, así que va con el rango emitido y no solo con el monto.
    const series = sales?.by_serie || [];
    const totalSeries = series.reduce((acc, x) => acc + parseFloat(x.revenue || 0), 0);
    const seriesHtml = series.map(x => {
        const rango = [x.first_invoice, x.last_invoice].filter(Boolean);
        const correlativos = rango.length
            ? (rango[0] === rango[rango.length - 1] ? esc(rango[0]) : `${esc(rango[0])} — ${esc(rango[rango.length - 1])}`)
            : "—";
        return `
        <tr>
            <td class="item-name">${esc(x.serie_name)}</td>
            <td class="td-center">${esc(x.count)}</td>
            <td class="td-center td-corr">${correlativos}</td>
            <td class="td-right td-total">${fmtP(x.revenue)}</td>
        </tr>`;
    }).join("");

    const empleadosHtml = empleados.map(e => `
        <div class="row-line">
            <span>${esc(e.employee_name || "Desconocido")} <span class="muted">· ${esc(e.count)} ventas</span></span>
            <span class="strong">${fmtP(e.revenue)}</span>
        </div>`).join("");

    // Cada diario en SU moneda: es la cifra que el cajero contó y la que trae el estado de
    // cuenta del banco, así que es contra la que se cuadra. La referencia va debajo en chico
    // porque es lo único comparable entre diarios, y sin ella el total del pie no se explica.
    // Un diario que ya está en moneda base no repite el número dos veces.
    const metodosHtml = metodos.map(m => {
        const propia = m.is_base === false && m.currency_symbol
            ? fmtMoney(parseFloat(m.total_journal || 0), m.currency_symbol)
            : null;
        return `
        <div class="row-line">
            <span>${esc(m.method_name)} <span class="muted">· ${esc(m.count)} trans.</span></span>
            <span class="strong">
                ${propia ? esc(propia) : fmtP(m.total)}
                ${propia ? `<span class="muted sub-amount">${fmtP(m.total)}</span>` : ""}
            </span>
        </div>`;
    }).join("");

    // La franja horaria va en el período y no en una nota al pie: sin ella, dos PDF del mismo
    // rango con recortes distintos son indistinguibles, y el de la noche parece mal sumado.
    const franja = range?.hour_from && range?.hour_to
        ? ` · ${range.hour_from} a ${range.hour_to}${range.hour_to < range.hour_from ? " del día siguiente" : ""}`
        : "";
    // Igual que la franja: un PDF de una sola serie tiene que decirlo, o quien lo reciba lo
    // lee como el total del negocio y no cuadra con nada.
    const serie = range?.serie_name ? ` · Serie ${range.serie_name}` : "";
    // Mismo criterio que la serie: un PDF de una sola sucursal tiene que decirlo, o parece el
    // total de la empresa.
    const sucursal = range?.warehouse_name ? ` · ${range.warehouse_name}` : "";
    const periodo = `${fmtDateShort(range?.from)} — ${fmtDateShort(range?.to)}${franja}${serie}${sucursal}`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>Reporte de ventas ${esc(periodo)} - ${esc(storeName)}</title>
    <style>${REPORT_CSS}
        /* Propias de este reporte */
        .serie-block { margin-top: 20px; page-break-inside: avoid; }
        .td-corr, th.td-corr { width: 190px; color: #666; }
        /* Lo pendiente y lo exonerado no entraron a caja: se despegan del total cobrado
           para que nadie los lea como parte de él. */
        .pending-line { border-bottom: none; color: #a33; padding-top: 2px; }
        /* El equivalente en moneda base, bajo el monto en la moneda del diario. En bloque
           para que caiga en su propia línea sin ensanchar la columna. */
        .sub-amount { display: block; font-weight: normal; font-size: 8.5px; line-height: 1.3; }
    </style>
</head>
<body>

    ${reportHeader({
        title: "Reporte de ventas",
        subtitle: `Documento interno · Período ${periodo}`,
        companyInfo,
    })}

    <div class="kpis">
        <div class="kpi">
            <div class="kpi-label">Ventas</div>
            <div class="kpi-value">${esc(s.total_sales ?? 0)}</div>
            <div class="kpi-sub">${parseInt(s.cancelled_count || 0) > 0
                ? `${esc(s.cancelled_count)} anuladas aparte`
                : "del período"}</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Facturado</div>
            <div class="kpi-value">${fmtP(s.total_revenue)}</div>
            ${parseFloat(s.total_returned || 0) > 0
                ? `<div class="kpi-sub">devoluciones: ${fmtP(s.total_returned)}</div>`
                : `<div class="kpi-sub">cobrado y por cobrar</div>`}
        </div>
        <div class="kpi">
            <div class="kpi-label">Ticket promedio</div>
            <div class="kpi-value">${fmtP(s.avg_ticket)}</div>
            <div class="kpi-sub">máx: ${fmtP(s.max_sale)}</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Por cobrar</div>
            <div class="kpi-value">${fmtP(s.pending_amount)}</div>
            <div class="kpi-sub">${esc(s.pending_count ?? 0)} ventas, ya incluidas</div>
        </div>
    </div>

    <div class="block-label">Detalle por producto · ordenado por ingreso</div>
    <table>
        <thead>
            <tr>
                <th class="td-num">#</th>
                <th>Producto</th>
                <th class="td-center">Unidades</th>
                <th class="td-center">Ventas</th>
                <th class="td-right">Precio prom.</th>
                <th class="td-right">Ingreso bruto</th>
                <th class="td-center">% del total</th>
            </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
        ${filas.length ? `
        <tfoot>
            <tr>
                <td class="td-num"></td>
                <td>Total · ${filas.length} productos</td>
                <td class="td-center">${fmtQty(totalUnidades)}</td>
                <td class="td-center"></td>
                <td class="td-right"></td>
                <td class="td-right">${fmtP(totalIngresos)}</td>
                <td class="td-center">100%</td>
            </tr>
        </tfoot>` : ""}
    </table>

    ${seriesHtml ? `
    <div class="serie-block">
        <div class="block-label">Facturación por serie</div>
        <table>
            <thead>
                <tr>
                    <th>Serie</th>
                    <th class="td-center">Facturas</th>
                    <th class="td-center td-corr">Correlativos emitidos</th>
                    <th class="td-right">Facturado</th>
                </tr>
            </thead>
            <tbody>${seriesHtml}</tbody>
            ${series.length > 1 ? `
            <tfoot>
                <tr>
                    <td>Total · ${series.length} series</td>
                    <td class="td-center"></td>
                    <td class="td-center td-corr"></td>
                    <td class="td-right">${fmtP(totalSeries)}</td>
                </tr>
            </tfoot>` : ""}
        </table>
    </div>` : ""}

    ${(metodosHtml || empleadosHtml) ? `
    <div class="cols">
        ${metodosHtml ? `
        <div class="col">
            <div class="block-label">Cobros por método</div>
            ${metodosHtml}
            <div class="row-line total-line">
                <span>Total cobrado <span class="muted">· en ${esc(sym)}</span></span>
                <span class="strong">${fmtP(totalMetodos)}</span>
            </div>
            <!-- Lo cobrado en el período no tiene por qué igualar lo facturado: una factura a
                 crédito se emite hoy y se cobra la semana que viene. Estas dos líneas explican
                 la diferencia en vez de dejar al lector restando de cabeza. -->
            ${pendiente > 0 ? `
            <div class="row-line pending-line">
                <span>Pendiente por cobrar <span class="muted">· ${esc(s.pending_count ?? 0)} ventas</span></span>
                <span class="strong">${fmtP(pendiente)}</span>
            </div>` : ""}
            ${exonerado > 0 ? `
            <div class="row-line pending-line">
                <span>Exonerado <span class="muted">· saldo perdonado</span></span>
                <span class="strong">${fmtP(exonerado)}</span>
            </div>` : ""}
        </div>` : ""}
        ${empleadosHtml ? `
        <div class="col">
            <div class="block-label">Ventas por empleado</div>
            ${empleadosHtml}
            <div class="row-line total-line">
                <span>Total facturado</span>
                <span class="strong">${fmtP(totalEmpleados)}</span>
            </div>
        </div>` : ""}
    </div>` : ""}

    <div class="footer">
        Generado el ${esc(fmtDate(new Date()))} · Importes en ${esc(baseCurrency?.code || sym)} · ${esc(storeName)}
    </div>

</body>
</html>`;

    openPrintFrame(html);
}