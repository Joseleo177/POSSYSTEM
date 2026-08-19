import { fmtMoney, fmtDate, resolveImageUrl } from ".";

// Cotización en tamaño carta, hermana de printInvoiceLetter. La maqueta térmica
// (printQuotationDoc) está hecha para rollo de 58/80mm: guardada como PDF sale una tira
// angosta que por WhatsApp o correo se lee fatal, y una cotización se envía mucho más de lo
// que se imprime — es el documento que el cliente guarda y compara con otro proveedor.
//
// Lleva los mismos campos que la térmica y con las mismas etiquetas; lo que cambia es el
// reparto. Los importes van en moneda base por la misma razón que en el rollo: el papel
// declara 30 días de validez y un precio en Bs. no aguanta ni una semana de tasa.

const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : String(n);
};

export function printQuotationLetter(quot, companyInfo, baseCurrency, activeCurrencies) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const showHeader = companyInfo?.show_header !== false;

    const sym = baseCurrency?.symbol || "Ref.";
    // En prosa la moneda se nombra por su código (USD), no por el símbolo de los importes:
    // "el precio pactado es en Ref." no se entiende y desmerece el documento.
    const baseCode = baseCurrency?.code || sym;
    const fmtP = n => fmtMoney(parseFloat(n || 0), sym);

    // Equivalencia con la tasa VIGENTE al imprimir, no con la guardada el día que se creó:
    // es la única cifra que le sirve a quien tiene el papel delante.
    const secondary = activeCurrencies?.find(c => !c.is_base);
    const rateHoy = parseFloat(secondary?.exchange_rate || 0);
    const equivale = rateHoy > 1;

    const total = parseFloat(quot.total || 0);
    const discount = parseFloat(quot.discount_amount || 0);
    const subtotal = total + discount;

    const itemsRows = (quot.items || []).map(i => `
        <tr>
            <td class="item-name">${esc(i.product_name || i.name || "")}</td>
            <td class="td-center">${fmtQty(i.quantity)}</td>
            <td class="td-right">${fmtP(i.price)}</td>
            <td class="td-right td-total">${fmtP(i.subtotal)}</td>
        </tr>`).join("");

    const issuerLine = [
        companyInfo?.rif ? `RIF: ${esc(companyInfo.rif)}` : "",
        [companyInfo?.address, companyInfo?.city].filter(Boolean).map(esc).join(", "),
        [companyInfo?.phone, companyInfo?.phone2].filter(Boolean).map(esc).join(" / "),
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF":
         el cliente recibe "Cotizacion 12 - Mi Tienda.pdf". -->
    <title>Cotización ${esc(quot.id)} - ${esc(storeName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

        /* Márgenes en 0 y el aire por el padding del body: con @page margin el área
           imprimible queda más angosta que la hoja y el layout se sale por la derecha. */
        @page { size: letter; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 10.5px;
            line-height: 1.5;
            color: #2b2b2b;
            background: #fff;
            width: 216mm;
            padding: 16mm 14mm;
        }
        .sheet { min-height: 247mm; display: flex; flex-direction: column; }
        .body-area { flex: 1; }

        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .doc-title { font-size: 19px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #1a1a1a; }
        .doc-warning { font-size: 8.5px; font-weight: 500; color: #999; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }
        .logo { max-height: 62px; max-width: 145px; object-fit: contain; }

        .issuer { margin-top: 20px; padding-bottom: 14px; }
        .issuer-name { font-size: 12.5px; font-weight: 700; color: #1a1a1a; }
        .issuer-slogan { font-size: 10px; font-style: italic; color: #888; }
        .issuer-line { font-size: 9.5px; color: #777; margin-top: 1px; }

        .info { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 26px; }
        .block-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #999; margin-bottom: 4px; }
        .party-name { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1a1a1a; }
        .party-line { font-size: 10px; color: #666; }

        .meta { min-width: 235px; }
        .meta-row { display: flex; justify-content: space-between; gap: 24px; font-size: 10px; padding: 1.5px 0; }
        .meta-label { color: #777; }
        .meta-value { font-weight: 700; color: #1a1a1a; text-align: right; }

        table { width: 100%; border-collapse: collapse; }
        thead { background: #e9e9e9; }
        th { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 9px 12px; text-align: left; color: #444; }
        td { padding: 10px 12px; font-size: 10.5px; vertical-align: middle; border-bottom: 1px solid #ededed; }
        .item-name { color: #2b2b2b; overflow-wrap: break-word; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 85px; }
        .td-right, th.td-right { text-align: right; white-space: nowrap; width: 125px; }
        .td-total { font-weight: 700; color: #1a1a1a; }

        .totals { width: 320px; margin-left: auto; margin-top: 14px; }
        .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 7px 12px; font-size: 10.5px; }
        .total-row.sub { border-bottom: 1px solid #ededed; }
        .total-row.discount { color: #a33; }
        .total-row.big { background: #e9e9e9; font-size: 12.5px; font-weight: 700; color: #1a1a1a; margin-top: 2px; padding: 10px 12px; }
        .total-row.equiv { font-size: 10px; color: #666; }
        .rate-note { padding: 2px 12px; font-size: 9px; color: #999; text-align: right; line-height: 1.3; }

        .notes { margin-top: 22px; }
        .notes-text { font-size: 10px; color: #666; white-space: pre-wrap; }

        .footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9.5px; color: #999; }
    </style>
</head>
<body>
<div class="sheet">
<div class="body-area">

    <div class="top">
        <div>
            <div class="doc-title">Cotización</div>
            <div class="doc-warning">Documento no fiscal · Presupuesto</div>
        </div>
        ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
    </div>

    <div class="issuer">
        <span class="issuer-name">${esc(storeName)}</span>
        ${showHeader && companyInfo?.slogan ? `<span class="issuer-slogan"> · "${esc(companyInfo.slogan)}"</span>` : ""}
        ${showHeader && issuerLine ? `<div class="issuer-line">${issuerLine}</div>` : ""}
    </div>

    <div class="info">
        ${(quot.customer_name || quot.customer_rif) ? `
        <div>
            <div class="block-label">Cliente</div>
            ${quot.customer_name ? `<div class="party-name">${esc(quot.customer_name)}</div>` : ""}
            ${quot.customer_rif ? `<div class="party-line">C.I./RIF: ${esc(quot.customer_rif)}</div>` : ""}
        </div>` : `<div></div>`}
        <div class="meta">
            <div class="meta-row"><span class="meta-label">Cotización N°:</span><span class="meta-value">#${esc(quot.id)}</span></div>
            <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${esc(fmtDate(quot.created_at))}</span></div>
            ${quot.employee_name ? `<div class="meta-row"><span class="meta-label">Vendedor:</span><span class="meta-value">${esc(quot.employee_name)}</span></div>` : ""}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Producto</th>
                <th class="td-center">Cant.</th>
                <th class="td-right">P.U.</th>
                <th class="td-right">Total</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
        ${discount > 0 ? `<div class="total-row sub"><span>Subtotal:</span><span>${fmtP(subtotal)}</span></div>` : ""}
        ${discount > 0 ? `<div class="total-row sub discount"><span>Descuento:</span><span>-${fmtP(discount)}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL:</span><span>${fmtP(total)}</span></div>
        ${equivale ? `
        <div class="total-row equiv"><span>Equivalente:</span><span>${fmtMoney(total * rateHoy, secondary.symbol)}</span></div>
        <div class="rate-note">Precios expresados en ${esc(baseCode)}. El equivalente es referencial,<br>calculado a la tasa del día: ${fmtMoney(rateHoy, secondary.symbol)} por ${esc(baseCode)}.</div>` : ""}
    </div>

    ${quot.notes ? `
    <div class="notes">
        <div class="block-label">Notas</div>
        <div class="notes-text">${esc(quot.notes)}</div>
    </div>` : ""}

</div>

    <div class="footer">${companyInfo?.footer || "Cotización válida por 30 días · ¡Gracias por su preferencia!"}</div>
</div>
</body>
</html>`;

    // Mismo iframe oculto que el PDF de factura: sin pestaña nueva y sin bloqueadores de
    // popup. 816px es el ancho exacto de la hoja carta a 96dpi.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        // La fuente y el logo llegan por red: sin la espera el diálogo puede abrirse con el
        // layout a medio armar y el PDF sale con la tipografía de respaldo.
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}
