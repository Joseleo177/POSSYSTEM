// fmtDateShort para el período (el rango son días, no instantes) y fmtDate para el sello de
// generación, donde la hora sí distingue dos copias del mismo reporte.
import { fmtMoney, fmtDate, fmtDateShort, resolveImageUrl } from ".";

// Reporte de ventas del período, en tamaño carta, para guardar como PDF o imprimir.
//
// Responde a la pregunta que el Excel deja a medias: qué se vendió y cuánto dejó cada cosa.
// El detalle va por PRODUCTO —unidades e ingreso bruto—, ordenado por lo que más dinero
// aportó, que es como se lee un cierre de mes. Los gráficos de la pantalla no se llevan al
// papel a propósito: en una hoja impresa lo que sirve es la tabla y los totales.
//
// Los importes van en moneda base, igual que el resto de los documentos: un reporte de un mes
// entero mezclaría tasas distintas si se expresara en bolívares.

const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Las unidades pueden ser fraccionarias (kilos, litros): se muestran con decimales solo
// cuando los tienen, para que "12" no salga como "12,000".
const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(3);
};

const pct = (parte, total) => {
    const t = parseFloat(total || 0);
    if (!(t > 0)) return "—";
    return `${((parseFloat(parte || 0) / t) * 100).toFixed(1)}%`;
};

/**
 * @param {object} sales     respuesta de /reports/sales (summary, by_method, by_employee…)
 * @param {array}  productos filas de /reports/products → top_by_revenue
 * @param {object} range     { from, to } en ISO
 */
export function printSalesReport(sales, productos, range, companyInfo, baseCurrency) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const showHeader = companyInfo?.show_header !== false;
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

    const metodosHtml = metodos.map(m => `
        <div class="row-line">
            <span>${esc(m.method_name)} <span class="muted">· ${esc(m.count)} trans.</span></span>
            <span class="strong">${fmtP(m.total)}</span>
        </div>`).join("");

    const issuerLine = [
        companyInfo?.rif ? `RIF: ${esc(companyInfo.rif)}` : "",
        [companyInfo?.address, companyInfo?.city].filter(Boolean).map(esc).join(", "),
        [companyInfo?.phone, companyInfo?.phone2].filter(Boolean).map(esc).join(" / "),
    ].filter(Boolean).join(" · ");

    const periodo = `${fmtDateShort(range?.from)} — ${fmtDateShort(range?.to)}`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>Reporte de ventas ${esc(periodo)} - ${esc(storeName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

        /* El aire va en @page y NO en el padding del body, al revés que la factura o la
           cotización: el padding solo abre margen al principio y al final del flujo, así que
           en un documento de varias hojas —y el detalle por producto de un mes lo es— la
           segunda página arrancaba pegada al borde del papel.
           Con margen de página el ancho útil ya viene recortado por el navegador, de ahí que
           el body no lleve el width fijo de 216mm que usan los documentos de una sola hoja:
           con los dos a la vez, el contenido se salía por la derecha. */
        @page { size: letter; margin: 14mm 12mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 10.5px; line-height: 1.5; color: #2b2b2b; background: #fff;
            width: 100%;
        }

        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .doc-title { font-size: 19px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #1a1a1a; }
        .doc-sub { font-size: 8.5px; font-weight: 500; color: #999; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }
        .logo { max-height: 62px; max-width: 145px; object-fit: contain; }

        .issuer { margin-top: 16px; padding-bottom: 12px; border-bottom: 1px solid #ededed; }
        .issuer-name { font-size: 12.5px; font-weight: 700; color: #1a1a1a; }
        .issuer-line { font-size: 9.5px; color: #777; margin-top: 1px; }

        /* Resumen en tarjetas: es lo primero que se mira al recibir la hoja. */
        .kpis { display: flex; gap: 8px; margin: 14px 0 18px; }
        .kpi { flex: 1; border: 1px solid #ededed; border-radius: 6px; padding: 9px 11px; }
        .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; }
        .kpi-value { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-top: 2px; white-space: nowrap; }
        .kpi-sub { font-size: 8.5px; color: #999; }

        .block-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #999; margin-bottom: 6px; }

        table { width: 100%; border-collapse: collapse; }
        thead { background: #e9e9e9; }
        /* La cabecera se repite en cada hoja: un listado de productos de un mes pasa de página
           y sin esto las columnas de la segunda hoja no se sabe qué son. */
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 8px 10px; text-align: left; color: #444; }
        td { padding: 7px 10px; font-size: 10.5px; vertical-align: middle; border-bottom: 1px solid #ededed; }
        .item-name { color: #2b2b2b; overflow-wrap: break-word; }
        .td-num, th.td-num { width: 30px; color: #aaa; text-align: right; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 70px; }
        .td-right, th.td-right { text-align: right; white-space: nowrap; width: 105px; }
        .td-total { font-weight: 700; color: #1a1a1a; }
        .td-pct { color: #777; width: 58px; }
        .empty { text-align: center; color: #999; padding: 24px 0; font-style: italic; }
        /* El pie de la tabla va como grupo normal para que salga UNA vez, al final del
           listado: como table-footer-group el navegador lo repite en cada hoja y el mismo
           "Total · N productos" aparecería tres veces en un reporte de tres páginas. */
        tfoot { display: table-row-group; }
        tfoot td { border-top: 2px solid #ddd; border-bottom: none; font-weight: 700; background: #f7f7f7; }

        /* La tabla de series es corta: se mantiene entera en una hoja en vez de dejar el
           encabezado al final de una página y las filas en la siguiente. */
        .serie-block { margin-top: 20px; page-break-inside: avoid; }
        .td-corr, th.td-corr { width: 190px; color: #666; }

        .cols { display: flex; gap: 24px; margin-top: 20px; page-break-inside: avoid; }
        .col { flex: 1; }
        .row-line { display: flex; justify-content: space-between; gap: 16px; font-size: 10px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
        .total-line { border-top: 2px solid #ddd; border-bottom: none; margin-top: 2px; padding-top: 6px; font-weight: 700; color: #1a1a1a; }
        /* Lo pendiente y lo exonerado no entraron a caja: se despegan del total cobrado para
           que nadie los lea como parte de él. */
        .pending-line { border-bottom: none; color: #a33; padding-top: 2px; }
        .muted { color: #999; }
        .strong { font-weight: 700; color: #1a1a1a; white-space: nowrap; }

        .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9px; color: #999; }
    </style>
</head>
<body>

    <div class="top">
        <div>
            <div class="doc-title">Reporte de ventas</div>
            <div class="doc-sub">Documento interno · Período ${esc(periodo)}</div>
        </div>
        ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
    </div>

    <div class="issuer">
        <span class="issuer-name">${esc(storeName)}</span>
        ${showHeader && issuerLine ? `<div class="issuer-line">${issuerLine}</div>` : ""}
    </div>

    <div class="kpis">
        <div class="kpi">
            <div class="kpi-label">Ventas</div>
            <div class="kpi-value">${esc(s.total_sales ?? 0)}</div>
            <div class="kpi-sub">facturas del período</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Ingresos brutos</div>
            <div class="kpi-value">${fmtP(s.total_revenue)}</div>
            ${parseFloat(s.total_returned || 0) > 0
                ? `<div class="kpi-sub">devoluciones: ${fmtP(s.total_returned)}</div>`
                : `<div class="kpi-sub">sin devoluciones</div>`}
        </div>
        <div class="kpi">
            <div class="kpi-label">Ticket promedio</div>
            <div class="kpi-value">${fmtP(s.avg_ticket)}</div>
            <div class="kpi-sub">máx: ${fmtP(s.max_sale)}</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Por cobrar</div>
            <div class="kpi-value">${fmtP(s.pending_amount)}</div>
            <div class="kpi-sub">${esc(s.pending_count ?? 0)} facturas</div>
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
                <span>Total cobrado</span>
                <span class="strong">${fmtP(totalMetodos)}</span>
            </div>
            <!-- Lo cobrado en el período no tiene por qué igualar lo facturado: una factura a
                 crédito se emite hoy y se cobra la semana que viene. Estas dos líneas explican
                 la diferencia en vez de dejar al lector restando de cabeza. -->
            ${pendiente > 0 ? `
            <div class="row-line pending-line">
                <span>Pendiente por cobrar <span class="muted">· ${esc(s.pending_count ?? 0)} facturas</span></span>
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

    // Mismo iframe oculto que los demás documentos: sin pestaña nueva y sin bloqueadores de
    // popup. 816px es el ancho exacto de la hoja carta a 96dpi.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        // La fuente y el logo llegan por red: sin la espera el diálogo puede abrirse con el
        // layout a medio armar.
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}