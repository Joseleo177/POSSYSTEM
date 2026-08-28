import { fmtMoney, fmtDate, fmtQty } from ".";
import { REPORT_CSS, esc, reportHeader, openPrintFrame } from "./printReportBase";

// Compra en tamaño carta, hermana del ticket térmico (printPurchaseOrder).
//
// La térmica está hecha para el depósito: sale en rollo, lleva casillas para ir marcando lo que
// va llegando y no habla de dinero. Esta es la otra mitad del trabajo: el comprobante que se
// archiva y con el que se cuadra con el proveedor, así que lleva los costos, el total y cuánto
// se le debe todavía. Mismo par que ya existe en las notas de traslado (térmica + carta).
//
// Los importes van en moneda base. Cuando la compra se pactó en otra moneda se muestra además
// su equivalente con la tasa guardada en la compra —no la de hoy—: es la que se usó al negociar
// y la que hace cuadrar la factura del proveedor.

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * @param {object} detail  compra con supplier_name, total, amount_paid, balance, items…
 * @param {array}  items   líneas (product_name, package_qty, package_unit, unit_cost, subtotal)
 */
export function printPurchaseLetter(detail, items, companyInfo, baseCurrency, activeCurrencies) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const sym = baseCurrency?.symbol || "Ref.";
    const fmtP = n => fmtMoney(parseFloat(n || 0), sym);

    const lineas = items || [];
    const total = parseFloat(detail?.total || 0);
    const pagado = parseFloat(detail?.amount_paid || 0);
    const saldo = parseFloat(detail?.balance ?? (total - pagado));

    // Moneda en la que se negoció, si no fue la base. La tasa es la de la compra: convertir con
    // la de hoy daría una cifra que ya no coincide con la factura del proveedor.
    const invCur = (activeCurrencies || []).find(c => c.id === detail?.currency_id);
    const invRate = parseFloat(detail?.exchange_rate || 1);
    const enOtraMoneda = !!invCur && !invCur.is_base && invRate > 1;
    const invSym = invCur?.symbol || "";
    const fmtInv = n => fmtMoney(round2(parseFloat(n || 0) * invRate), invSym);

    const esBorrador = detail?.status === "borrador";
    const titulo = esBorrador ? "Orden de compra" : "Factura de compra";

    const filasHtml = lineas.length ? lineas.map((i, idx) => {
        const empaque = (i.package_unit || "").toLowerCase() === "unidad"
            ? "UNIDAD"
            : `${esc(i.package_unit || "")} × ${fmtQty(i.package_size || 1)}`;
        return `
        <tr>
            <td class="td-num">${idx + 1}</td>
            <td class="item-name">
                <div class="prod">${esc(i.product_name || i.product?.name || "—")}</div>
                <div class="pkg">${empaque}${i.lot_number ? ` · Lote ${esc(i.lot_number)}` : ""}</div>
            </td>
            <td class="td-center">${fmtQty(i.package_qty)}</td>
            <td class="td-right">${fmtP(i.unit_cost)}</td>
            <td class="td-right td-total">${fmtP(i.subtotal)}</td>
            ${enOtraMoneda ? `<td class="td-right td-inv">${fmtInv(i.subtotal)}</td>` : ""}
        </tr>`;
    }).join("")
        : `<tr><td colspan="${enOtraMoneda ? 6 : 5}" class="empty">Sin productos cargados</td></tr>`;

    const fecha = fmtDate(detail?.created_at);

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>${esc(titulo)} ${esc(detail?.id ? `#${detail.id}` : "")} - ${esc(detail?.supplier_name || storeName)}</title>
    <style>${REPORT_CSS}
        .info { display: flex; justify-content: space-between; gap: 40px; margin: 16px 0 18px; }
        .party-name { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1a1a1a; }
        .party-line { font-size: 10px; color: #666; }
        .meta { min-width: 235px; }
        .meta-row { display: flex; justify-content: space-between; gap: 24px; font-size: 10px; padding: 1.5px 0; }
        .meta-label { color: #777; }
        .meta-value { font-weight: 700; color: #1a1a1a; text-align: right; }

        .prod { color: #2b2b2b; font-weight: 600; }
        .pkg { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
        .td-inv, th.td-inv { width: 115px; color: #666; }

        .totals { width: 340px; margin-left: auto; margin-top: 14px; page-break-inside: avoid; }
        .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 6px 12px; font-size: 10.5px; }
        .total-row.sub { border-bottom: 1px solid #ededed; }
        .total-row.big { background: #e9e9e9; font-size: 12.5px; font-weight: 700; color: #1a1a1a; margin-top: 2px; padding: 10px 12px; }
        /* El saldo al proveedor es el dato que se viene a buscar cuando se saca este papel. */
        .total-row.saldo { color: #a33; font-weight: 700; }
        .rate-note { padding: 2px 12px; font-size: 9px; color: #999; text-align: right; }

        .notes { margin-top: 20px; page-break-inside: avoid; }
        .notes-text { font-size: 10px; color: #666; white-space: pre-wrap; }
        .firmas { display: flex; gap: 60px; margin-top: 34px; page-break-inside: avoid; }
        .firma { flex: 1; border-top: 1px solid #bbb; padding-top: 5px; text-align: center; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    </style>
</head>
<body>

    ${reportHeader({
        title: titulo,
        subtitle: "Documento interno · No fiscal",
        companyInfo,
    })}

    <div class="info">
        <div>
            <div class="block-label">Proveedor</div>
            <div class="party-name">${esc(detail?.supplier_name || "No registrado")}</div>
            ${detail?.supplier_rif ? `<div class="party-line">RIF: ${esc(detail.supplier_rif)}</div>` : ""}
        </div>
        <div class="meta">
            <div class="meta-row"><span class="meta-label">Compra N°:</span><span class="meta-value">#${esc(detail?.id ?? "—")}</span></div>
            <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${esc(fecha)}</span></div>
            ${detail?.warehouse_name ? `<div class="meta-row"><span class="meta-label">Almacén:</span><span class="meta-value">${esc(detail.warehouse_name)}</span></div>` : ""}
            ${detail?.employee_name ? `<div class="meta-row"><span class="meta-label">Registró:</span><span class="meta-value">${esc(detail.employee_name)}</span></div>` : ""}
            <div class="meta-row"><span class="meta-label">Estado:</span><span class="meta-value">${esc((detail?.payment_status || "pendiente").toUpperCase())}</span></div>
        </div>
    </div>

    <div class="block-label">Mercancía recibida</div>
    <table>
        <thead>
            <tr>
                <th class="td-num">#</th>
                <th>Producto</th>
                <th class="td-center">Cantidad</th>
                <th class="td-right">Costo unit.</th>
                <th class="td-right">Subtotal</th>
                ${enOtraMoneda ? `<th class="td-right td-inv">En ${esc(invCur.code || invSym)}</th>` : ""}
            </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
    </table>

    <div class="totals">
        <div class="total-row sub">
            <span>Total de la compra</span>
            <span>${fmtP(total)}</span>
        </div>
        ${enOtraMoneda ? `
        <div class="total-row sub">
            <span>Equivale a</span>
            <span>${fmtInv(total)}</span>
        </div>
        <div class="rate-note">Tasa de la compra: ${esc(invRate.toFixed(4))}</div>` : ""}
        <div class="total-row sub">
            <span>Abonado al proveedor</span>
            <span>${fmtP(pagado)}</span>
        </div>
        <div class="total-row ${saldo > 0.01 ? "saldo" : ""}">
            <span>${saldo > 0.01 ? "Saldo pendiente" : "Sin saldo pendiente"}</span>
            <span>${fmtP(Math.max(0, saldo))}</span>
        </div>
        <div class="total-row big">
            <span>Total</span>
            <span>${fmtP(total)}</span>
        </div>
    </div>

    ${detail?.notes ? `
    <div class="notes">
        <div class="block-label">Notas</div>
        <div class="notes-text">${esc(detail.notes)}</div>
    </div>` : ""}

    <div class="firmas">
        <div class="firma">Recibido por</div>
        <div class="firma">Conforme proveedor</div>
    </div>

    <div class="footer">
        Generado el ${esc(fmtDate(new Date()))} · Importes en ${esc(baseCurrency?.code || sym)} · ${esc(storeName)}
    </div>

</body>
</html>`;

    openPrintFrame(html);
}
