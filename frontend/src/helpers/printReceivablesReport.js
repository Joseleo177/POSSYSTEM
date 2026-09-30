import { fmtMoney, fmtDate } from ".";
import { REPORT_CSS, esc, reportHeader, openPrintFrame } from "./printReportBase";

// Estado de cuentas por cobrar, en tamaño carta, para salir a cobrar con el papel en la mano.
//
// Es una foto al día de hoy, no un período: la deuda es la que hay ahora. Por eso el documento
// se fecha con el corte y no con un rango, y por eso los saldos llevan su equivalente en
// bolívares a la tasa VIGENTE al imprimir: es la cifra que el cliente necesita para pagar hoy.
// El monto en moneda base queda al lado, que es como está registrada la deuda.

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// Días que lleva esperando la factura más vieja del cliente. Mismo cálculo que la pantalla.
const diasDesde = (fecha) => {
    if (!fecha) return null;
    const t = new Date(fecha).getTime();
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

/**
 * @param {object} data           respuesta de /reports/receivables (summary, aging, by_customer)
 * @param {object} companyInfo    datos de la empresa (useApp)
 * @param {object} baseCurrency   moneda base
 * @param {array}  activeCurrencies para tomar la tasa vigente de la moneda secundaria
 */
export function printReceivablesReport(data, companyInfo, baseCurrency, activeCurrencies) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const sym = baseCurrency?.symbol || "Ref.";
    const fmtP = n => fmtMoney(parseFloat(n || 0), sym);

    // Tasa del día, no la que tenía cada factura: lo que se cobra hoy se cobra a la de hoy.
    const secondary = (activeCurrencies || []).find(c => !c.is_base);
    const rate = parseFloat(secondary?.exchange_rate || 0);
    const conBs = rate > 1;
    const symBs = secondary?.symbol || "Bs.";
    const fmtBs = n => fmtMoney(round2(parseFloat(n || 0) * rate), symBs);

    const s = data?.summary || {};
    const a = data?.aging || {};
    const clientes = data?.by_customer || [];

    const totalSaldo = clientes.reduce((acc, c) => acc + parseFloat(c.balance || 0), 0);
    const totalFacturas = clientes.reduce((acc, c) => acc + parseInt(c.invoice_count || 0, 10), 0);
    const facturado = parseFloat(s.total_billed || 0);
    const recuperado = facturado > 0 ? ((facturado - parseFloat(s.total_balance || 0)) / facturado) * 100 : 0;

    const filasHtml = clientes.length ? clientes.map((c, i) => {
        const dias = diasDesde(c.oldest_invoice);
        // Más de 60 días en rojo: es la fila que hay que atender primero y tiene que saltar a
        // la vista sin ponerse a leer la columna de días.
        const critica = dias != null && dias > 60;
        return `
        <tr class="${critica ? "row-critica" : ""}">
            <td class="td-num">${i + 1}</td>
            <td class="item-name">
                <div class="cli-name">${esc(c.customer_name || "Sin cliente")}</div>
                ${c.rif ? `<div class="cli-sub">${esc(c.rif)}</div>` : ""}
            </td>
            <td class="td-tel">${esc(c.phone || "—")}</td>
            <td class="td-center">${esc(c.invoice_count ?? 0)}</td>
            <td class="td-right td-total">${fmtP(c.balance)}</td>
            ${conBs ? `<td class="td-right td-bs">${fmtBs(c.balance)}</td>` : ""}
            <td class="td-right td-dias ${critica ? "danger strong" : ""}">${dias == null ? "—" : `${dias} ${dias === 1 ? "día" : "días"}`}</td>
        </tr>`;
    }).join("")
        : `<tr><td colspan="${conBs ? 7 : 6}" class="empty">Sin cuentas por cobrar pendientes</td></tr>`;

    // Tramos de antigüedad, con la misma lectura que la pantalla: punto de color, monto y una
    // barra con su parte del saldo. El color es señal y solo aparece si hay deuda en el tramo:
    // "Más de 60 días: Ref. 0.00" en rojo alarmaba por nada.
    const saldoCalle = parseFloat(s.total_balance || 0);
    const tramos = [
        { label: "0 a 30 días",    monto: a.d0_30_amount,    cant: a.d0_30_count,    tono: "neutro" },
        { label: "31 a 60 días",   monto: a.d31_60_amount,   cant: a.d31_60_count,   tono: "ambar" },
        { label: "Más de 60 días", monto: a.d60_plus_amount, cant: a.d60_plus_count, tono: "rojo" },
    ];

    const tramosHtml = tramos.map(t => {
        const monto = parseFloat(t.monto || 0);
        const hay   = monto > 0.001;
        const pct   = saldoCalle > 0 ? Math.min(100, (monto / saldoCalle) * 100) : 0;
        const tono  = hay ? t.tono : "neutro";
        const cant  = parseInt(t.cant || 0, 10);
        return `
        <div class="kpi">
            <div class="kpi-label"><span class="dot dot-${t.tono}"></span>${esc(t.label)}</div>
            <div class="kpi-row">
                <div class="kpi-value ${tono === "rojo" ? "danger" : ""}">${fmtP(monto)}</div>
                <div class="kpi-pct">${pct.toFixed(1)}%</div>
            </div>
            <div class="bar"><div class="bar-fill bar-${tono}" style="width:${pct}%"></div></div>
            <div class="kpi-sub">${cant} ${cant === 1 ? "factura" : "facturas"}${conBs && hay ? ` · ${fmtBs(monto)}` : ""}</div>
        </div>`;
    }).join("");

    const corte = fmtDate(new Date());

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>Cuentas por cobrar ${esc(corte)} - ${esc(storeName)}</title>
    <style>${REPORT_CSS}
        .cli-name { font-weight: 600; color: #1a1a1a; }
        .cli-sub { font-size: 9px; color: #999; }
        .td-tel, th.td-tel { width: 110px; color: #666; white-space: nowrap; }
        .td-bs, th.td-bs { width: 120px; color: #666; }
        .td-dias, th.td-dias { width: 72px; color: #666; }
        /* Un fondo muy tenue, no un rojo pleno: la hoja se imprime a menudo en blanco y negro
           y un bloque oscuro dejaría la fila ilegible. */
        .row-critica td { background: #fdf3f3; }
        .row-critica td:first-child { box-shadow: inset 3px 0 0 #d33; }

        .kpi-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .kpi-pct { font-size: 9px; color: #999; }
        .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
        .dot-neutro { background: #b5b5b5; } .dot-ambar { background: #f59e0b; } .dot-rojo { background: #ef4444; }
        .bar { height: 4px; border-radius: 4px; background: #eee; margin: 7px 0 5px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 4px; }
        .bar-neutro { background: #9a9a9a; } .bar-ambar { background: #f59e0b; } .bar-rojo { background: #ef4444; }
    </style>
</head>
<body>

    ${reportHeader({
        title: "Cuentas por cobrar",
        subtitle: `Documento interno · Saldos al ${corte}`,
        companyInfo,
    })}

    <div class="kpis">
        <div class="kpi">
            <div class="kpi-label">Facturas pendientes</div>
            <div class="kpi-value">${esc(s.total_invoices ?? 0)}</div>
            <div class="kpi-sub">sin saldar</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Saldo en calle</div>
            <div class="kpi-value">${fmtP(s.total_balance)}</div>
            <div class="kpi-sub">${conBs ? fmtBs(s.total_balance) : "por cobrar"}</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Cartera total</div>
            <div class="kpi-value">${fmtP(s.total_billed)}</div>
            <div class="kpi-sub">facturado con saldo</div>
        </div>
        <div class="kpi">
            <div class="kpi-label">Recuperación</div>
            <div class="kpi-value">${recuperado.toFixed(1)}%</div>
            <div class="kpi-sub">cobrado: ${fmtP(s.total_collected)}</div>
        </div>
    </div>

    <div class="block-label">Antigüedad de la deuda</div>
    <div class="kpis">${tramosHtml}</div>

    <div class="block-label">Deuda por cliente <span class="muted">· de mayor a menor saldo</span></div>
    <table>
        <thead>
            <tr>
                <th class="td-num">#</th>
                <th>Cliente</th>
                <th class="td-tel">Teléfono</th>
                <th class="td-center">Facturas</th>
                <th class="td-right">Saldo</th>
                ${conBs ? `<th class="td-right td-bs">En ${esc(symBs)}</th>` : ""}
                <th class="td-right td-dias">Antigüedad</th>
            </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
        ${clientes.length ? `
        <tfoot>
            <tr>
                <td class="td-num"></td>
                <td>Total · ${clientes.length} clientes</td>
                <td class="td-tel"></td>
                <td class="td-center">${totalFacturas}</td>
                <td class="td-right">${fmtP(totalSaldo)}</td>
                ${conBs ? `<td class="td-right td-bs">${fmtBs(totalSaldo)}</td>` : ""}
                <td class="td-right td-dias"></td>
            </tr>
        </tfoot>` : ""}
    </table>

    <div class="footer">
        Generado el ${esc(corte)} · Saldos en ${esc(baseCurrency?.code || sym)}${
            conBs ? ` · Equivalencias a ${esc(fmtMoney(rate, symBs))} por ${esc(baseCurrency?.code || "USD")}, tasa del día` : ""
        } · ${esc(storeName)}
    </div>

</body>
</html>`;

    openPrintFrame(html);
}
