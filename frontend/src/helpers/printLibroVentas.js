import { fmtNumber } from ".";
import { REPORT_CSS, esc, reportHeader, openPrintFrame } from "./printReportBase";
import { columnasLibro } from "./iva";

// Libro de ventas en carta horizontal: son muchas columnas de montos y en vertical no caben sin
// achicar la letra hasta volverla ilegible. Mismas filas y mismos totales que la pantalla y el
// Excel (todo sale de /reports/libro-ventas).

const fecha = (d) => String(d || "").split("-").reverse().join("/");
const n2 = (n) => fmtNumber(n || 0, 2);

export function printLibroVentas(data, range, companyInfo, warehouseName) {
    const local = data.local_symbol || "Bs.";
    const cols = columnasLibro(data);
    const s = data.resumen || {};
    const storeName = companyInfo?.name || "MI TIENDA POS";

    const filas = (data.docs || []).map(d => `
        <tr class="${d.anulada ? "anulada" : ""}">
            <td class="num sub-num">${d.n ?? ""}</td>
            <td class="nowrap">${esc(fecha(d.fecha))}</td>
            <td class="nowrap">${esc(d.tipo_documento || "")}<div class="sub">${d.transaccion === "03-anu" ? "03-Anu." : "01-Reg."}</div></td>
            <td class="nowrap"><b>${esc(d.numero)}</b>${d.afectada ? `<div class="sub">Afecta ${esc(d.afectada)}</div>` : ""}</td>
            <td class="nowrap">${esc(d.control || "")}</td>
            <td>${esc(d.nombre || (d.rif ? "" : "Consumidor final"))}${d.rif ? `<div class="sub">${esc(d.rif)}</div>` : ""}${d.sin_iva ? `<div class="sub">Sin IVA</div>` : ""}</td>
            <td class="num strong">${n2(d.total)}</td>
            <td class="num">${n2(d.exento)}</td>
            ${cols.map(t => `<td class="num">${n2(d.gravado?.[t]?.base)}</td><td class="num">${n2(d.gravado?.[t]?.iva)}</td>`).join("")}
            <td class="num">${n2(d.retenido)}</td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Libro de ventas ${esc(range.from)} a ${esc(range.to)} - ${esc(storeName)}</title>
    <style>${REPORT_CSS}
        @page { size: letter landscape; margin: 0; }
        td, th { padding: 5px 6px; }
        td { font-size: 9px; }
        th { font-size: 8px; }
        .num, th.num { text-align: right; white-space: nowrap; }
        .nowrap { white-space: nowrap; }
        .sub { font-size: 8px; color: #999; }
        .strong { font-weight: 700; color: #1a1a1a; }
        .anulada td { color: #aaa; }
        .sub-num { color: #aaa; }
    </style>
</head>
<body>
    ${reportHeader({
        title: "Libro de ventas",
        subtitle: `Del ${fecha(range.from)} al ${fecha(range.to)}${warehouseName ? ` · ${warehouseName}` : ""} · montos en ${local}, IVA incluido en el total`,
        companyInfo,
    })}

    <div class="kpis">
        <div class="kpi"><div class="kpi-label">Ventas con IVA</div><div class="kpi-value">${local} ${n2(s.total)}</div><div class="kpi-sub">${s.facturas || 0} facturas · ${s.notas || 0} N/C</div></div>
        <div class="kpi"><div class="kpi-label">Base imponible</div><div class="kpi-value">${local} ${n2(cols.reduce((a, t) => a + (s.gravado?.[t]?.base || 0), 0))}</div></div>
        <div class="kpi"><div class="kpi-label">Débito fiscal</div><div class="kpi-value">${local} ${n2(s.iva_total)}</div></div>
        <div class="kpi"><div class="kpi-label">Exento</div><div class="kpi-value">${local} ${n2(s.exento)}</div>${s.anuladas ? `<div class="kpi-sub">${s.anuladas} anuladas</div>` : ""}</div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="num">N°</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>N° control</th>
                <th>Cliente</th>
                <th class="num">Total</th>
                <th class="num">Exento</th>
                ${cols.map(t => `<th class="num">Base ${t} %</th><th class="num">IVA ${t} %</th>`).join("")}
                <th class="num">IVA retenido</th>
            </tr>
        </thead>
        <tbody>${filas || `<tr><td colspan="${9 + cols.length * 2}" class="empty">Sin documentos en el período</td></tr>`}</tbody>
        <tfoot>
            <tr>
                <td colspan="6">Total del período</td>
                <td class="num">${n2(s.total)}</td>
                <td class="num">${n2(s.exento)}</td>
                ${cols.map(t => `<td class="num">${n2(s.gravado?.[t]?.base)}</td><td class="num">${n2(s.gravado?.[t]?.iva)}</td>`).join("")}
                <td class="num">${n2(s.retenido)}</td>
            </tr>
        </tfoot>
    </table>
</body>
</html>`;

    openPrintFrame(html);
}
