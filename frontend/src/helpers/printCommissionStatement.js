import { fmtMoney, fmtDate, fmtDateShort } from ".";
import { REPORT_CSS, esc, reportHeader, openPrintFrame } from "./printReportBase";

// Estado de cuenta de comisiones de un vendedor, en tamaño carta: es el papel que se le entrega
// al liquidarle (o que firma al recibir el pago). Mismo contenido que la pantalla: saldo al
// empezar, cada cobro y devolución que movió su comisión, lo liquidado y el saldo al cerrar.

const KIND = { venta: "Saldo a favor aplicado", cobro: "Cobro", devolucion: "Devolución", exonerado: "Exonerado" };

/**
 * @param {object} st          respuesta de /commissions/sellers/:id/statement
 * @param {object} range       { from, to } del período
 * @param {object} companyInfo datos de la empresa (useApp)
 * @param {string} sym         símbolo de la moneda base
 */
export function printCommissionStatement(st, range, companyInfo, sym = "Ref.") {
    const fmt = n => fmtMoney(parseFloat(n || 0), sym);
    const s = st.seller || {};
    const periodo = range?.from || range?.to
        ? `Del ${range.from ? fmtDateShort(range.from) : "inicio"} al ${range.to ? fmtDateShort(range.to) : "día de hoy"}`
        : "Desde el inicio";

    const filas = (st.movements || []).map((m, i) => `
        <tr>
            <td class="td-num">${i + 1}</td>
            <td class="td-fecha">${esc(fmtDateShort(m.day))}</td>
            <td class="item-name">
                <div class="doc">${esc(m.invoice_number || `#${m.sale_id}`)} · ${esc(KIND[m.kind] || m.kind)}</div>
                ${m.customer_name ? `<div class="sub">${esc(m.customer_name)}</div>` : ""}
            </td>
            <td class="td-right">${fmt(m.base)}</td>
            <td class="td-pct">${esc(m.pct)}%</td>
            <td class="td-right td-total ${m.commission < 0 ? "danger" : ""}">${fmt(m.commission)}</td>
        </tr>`).join("")
        || `<tr><td colspan="6" class="empty">Sin cobros con comisión en el período</td></tr>`;

    const pagos = (st.payouts || []).map(p => `
        <div class="row-line">
            <span>${esc(fmtDateShort(p.paid_at))} · ${esc(p.journal_name || "Pago")}${p.reference ? ` · Ref. ${esc(p.reference)}` : ""}${p.vivo ? "" : " · anulado"}</span>
            <span class="strong ${p.vivo ? "" : "muted"}">${fmt(p.amount)}</span>
        </div>`).join("") || `<div class="row-line"><span class="muted">Sin liquidaciones en el período</span><span></span></div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Comisiones ${esc(s.name || "")} - ${esc(companyInfo?.name || "")}</title>
    <style>
        ${REPORT_CSS}
        .td-fecha { width: 74px; white-space: nowrap; color: #666; }
        .doc { font-weight: 600; color: #1a1a1a; }
        .sub { font-size: 9.5px; color: #888; }
        .signs { display: flex; gap: 60px; margin-top: 48px; page-break-inside: avoid; }
        .sign { flex: 1; text-align: center; }
        .sign-line { border-top: 1px solid #555; margin-bottom: 4px; }
        .sign-label { font-size: 9px; color: #777; }
    </style>
</head>
<body>
    ${reportHeader({ title: "Estado de cuenta de comisiones", subtitle: periodo, companyInfo })}

    <div class="cols" style="margin-top:14px">
        <div class="col">
            <div class="block-label">${esc(s.name || "")}</div>
            <div class="row-line"><span class="muted">Código</span><span class="strong">${esc(s.code || "")}</span></div>
            ${s.doc_id ? `<div class="row-line"><span class="muted">Cédula</span><span class="strong">${esc(s.doc_id)}</span></div>` : ""}
            <div class="row-line"><span class="muted">Comisión actual</span><span class="strong">${esc(s.commission_pct)}% sobre lo cobrado</span></div>
        </div>
        <div class="col">
            <div class="block-label">Resumen</div>
            <div class="row-line"><span>Saldo al empezar</span><span class="strong">${fmt(st.opening)}</span></div>
            <div class="row-line"><span>Ganado en el período</span><span class="strong">${fmt(st.earned)}</span></div>
            ${st.returned ? `<div class="row-line"><span class="muted">de eso, devoluciones</span><span class="danger">${fmt(st.returned)}</span></div>` : ""}
            <div class="row-line"><span>Liquidado</span><span class="strong">${fmt(-st.paid)}</span></div>
            <div class="row-line total-line"><span>Saldo por liquidar</span><span>${fmt(st.closing)}</span></div>
        </div>
    </div>

    <div class="block-label" style="margin-top:22px">Movimientos</div>
    <table>
        <thead>
            <tr>
                <th class="td-num">#</th>
                <th>Fecha</th>
                <th>Factura</th>
                <th class="td-right">Base</th>
                <th>%</th>
                <th class="td-right">Comisión</th>
            </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
            <tr><td colspan="5">Total del período</td><td class="td-right">${fmt(st.earned)}</td></tr>
        </tfoot>
    </table>

    <div class="cols">
        <div class="col">
            <div class="block-label">Liquidaciones</div>
            ${pagos}
        </div>
        <div class="col">
            <div class="block-label">Por cobrar <span class="muted">· se gana al cobrarse</span></div>
            ${(st.pending || []).slice(0, 12).map(p => `
            <div class="row-line"><span>${esc(p.invoice_number || `#${p.sale_id}`)} · ${esc(p.customer_name || "")}</span><span class="strong">${fmt(p.pend)}</span></div>`).join("")
            || `<div class="row-line"><span class="muted">Nada pendiente de cobro</span><span></span></div>`}
        </div>
    </div>

    <div class="signs">
        <div class="sign"><div class="sign-line"></div><div class="sign-label">Entregado por</div></div>
        <div class="sign"><div class="sign-line"></div><div class="sign-label">Recibido conforme · ${esc(s.name || "")}</div></div>
    </div>

    <div class="footer">Base = lo cobrado de cada factura sin recargos (delivery, servicio). Las devoluciones restan el día en que se hacen. Emitido el ${esc(fmtDate(new Date().toISOString()))}.</div>
</body>
</html>`;

    openPrintFrame(html);
}
