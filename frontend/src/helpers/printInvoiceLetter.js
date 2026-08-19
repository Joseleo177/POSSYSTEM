import { fmtDate, resolveImageUrl } from ".";

// Segunda maqueta del ticket, en tamaño carta. La de caja (printReceipt, en ReceiptModal)
// está hecha para rollo térmico — @page de 58/80mm y alto automático — y al guardarla como
// PDF sale una tira larga y angosta que en WhatsApp se ve como una franja ilegible. Esta
// versión existe solo para el envío digital: la impresión de caja sigue usando la térmica.
//
// Lleva exactamente los mismos campos que el ticket térmico, con las mismas etiquetas. Lo
// que cambia es el reparto y el tono: la térmica apila todo centrado y en negritas porque
// el rollo mide 80mm y la impresora es de 1 bit; aquí hay 188mm útiles y el destino es un
// PDF, así que va en dos columnas y con pesos normales. Si se agrega un dato al ticket, va
// aquí también — no debe haber nada en el PDF que el cliente no vea impreso en caja.
//
// Los totales llegan ya calculados por ReceiptModal para no duplicar la lógica de tasa y
// moneda: el PDF muestra los mismos números que el cajero tiene en pantalla.

const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function printInvoiceLetter({ sale, totals, companyInfo }) {
    const s = sale;
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const invoiceLabel = s.invoice_number || `#${s.id}`;
    const showHeader = companyInfo?.show_header !== false;

    const itemsRows = totals.items.map(i => {
        const qty = parseFloat(i.quantity || 1);
        return `
        <tr>
            <td class="item-name">${esc(i.name || i.product_name || "")}</td>
            <td class="td-center">${qty % 1 === 0 ? Math.round(qty) : qty}</td>
            <td class="td-right">${i.fmtPrice}</td>
            <td class="td-right td-total">${i.fmtSubtotal}</td>
        </tr>`;
    }).join("");

    // Línea del emisor: los mismos datos que la térmica imprime centrados bajo el logo,
    // aquí en una sola línea corrida para no robarle alto a la hoja.
    const issuerLine = [
        companyInfo?.rif ? `RIF: ${esc(companyInfo.rif)}` : "",
        [companyInfo?.address, companyInfo?.city].filter(Boolean).map(esc).join(", "),
        [companyInfo?.phone, companyInfo?.phone2].filter(Boolean).map(esc).join(" / "),
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF",
         así que lleva tienda y número: el cliente recibe "Recibo A-0048 - Mi Tienda.pdf". -->
    <title>Recibo ${esc(invoiceLabel)} - ${esc(storeName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

        /* Márgenes en 0 y el aire se da con el padding del body. Con @page margin el área
           imprimible queda más angosta que la hoja y el layout se salía por la derecha:
           así el ancho del documento (216mm) coincide exacto con el del iframe. */
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
        /* A diferencia de la térmica (1 bit, sin grises), aquí el destino es PDF o láser:
           los grises sí se imprimen y son los que dan el aire del documento formal. */

        /* La hoja se estira al alto completo y el contenido crece en el medio, así el pie
           queda anclado abajo en vez de dejar media página en blanco tras el total. */
        .sheet { min-height: 247mm; display: flex; flex-direction: column; }
        .body-area { flex: 1; }

        /* ── Cabecera ── */
        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .doc-title { font-size: 19px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #1a1a1a; }
        .doc-warning { font-size: 8.5px; font-weight: 500; color: #999; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }
        .logo { max-height: 62px; max-width: 145px; object-fit: contain; }

        .issuer { margin-top: 20px; padding-bottom: 14px; }
        .issuer-name { font-size: 12.5px; font-weight: 700; color: #1a1a1a; }
        .issuer-slogan { font-size: 10px; font-style: italic; color: #888; }
        .issuer-line { font-size: 9.5px; color: #777; margin-top: 1px; }

        /* ── Cliente a la izquierda, metadatos a la derecha ── */
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
        /* En carta hay ancho de sobra: el nombre del producto va completo, sin el recorte
           a 32mm que obliga la térmica. */
        .item-name { color: #2b2b2b; overflow-wrap: break-word; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 85px; }
        .td-right, th.td-right { text-align: right; white-space: nowrap; width: 125px; }
        .td-total { font-weight: 700; color: #1a1a1a; }

        .totals { width: 300px; margin-left: auto; margin-top: 14px; }
        .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 7px 12px; font-size: 10.5px; }
        .total-row.sub { border-bottom: 1px solid #ededed; }
        .total-row.discount { color: #a33; }
        .total-row.big { background: #e9e9e9; font-size: 12.5px; font-weight: 700; color: #1a1a1a; margin-top: 2px; padding: 10px 12px; }

        .footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9.5px; color: #999; }
    </style>
</head>
<body>
<div class="sheet">
<div class="body-area">

    <div class="top">
        <div>
            <div class="doc-title">Ticket de caja</div>
            <div class="doc-warning">Documento no fiscal</div>
        </div>
        ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
    </div>

    <div class="issuer">
        <span class="issuer-name">${esc(storeName)}</span>
        ${showHeader && companyInfo?.slogan ? `<span class="issuer-slogan"> · "${esc(companyInfo.slogan)}"</span>` : ""}
        ${showHeader && issuerLine ? `<div class="issuer-line">${issuerLine}</div>` : ""}
    </div>

    <div class="info">
        ${(s.customer_name || s.customer_rif) ? `
        <div>
            <div class="block-label">Cliente</div>
            ${s.customer_name ? `<div class="party-name">${esc(s.customer_name)}</div>` : ""}
            ${s.customer_rif ? `<div class="party-line">C.I./RIF: ${esc(s.customer_rif)}</div>` : ""}
        </div>` : `<div></div>`}
        <div class="meta">
            <div class="meta-row"><span class="meta-label">Recibo N°:</span><span class="meta-value">${esc(invoiceLabel)}</span></div>
            <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${esc(fmtDate(s.created_at))}</span></div>
            ${s.employee_name ? `<div class="meta-row"><span class="meta-label">Cajero:</span><span class="meta-value">${esc(s.employee_name)}</span></div>` : ""}
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
        <div class="total-row sub"><span>Subtotal:</span><span>${totals.fmtSubtotal}</span></div>
        ${s.discount > 0 ? `<div class="total-row sub discount"><span>Descuento:</span><span>-${totals.fmtDiscount}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL:</span><span>${totals.fmtTotal}</span></div>
    </div>

</div>

    <div class="footer">${companyInfo?.footer || "¡Gracias por su compra!"}</div>
</div>
</body>
</html>`;

    // Mismo iframe oculto que usa el ticket: no abre pestaña nueva y no lo frenan los
    // bloqueadores de popup. 816px es exactamente el ancho de la hoja carta a 96dpi, así
    // que el layout se calcula igual que en el papel antes de abrir el diálogo.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        // La fuente y el logo llegan por red; sin esta espera el diálogo puede abrirse
        // con el layout a medio armar y el PDF sale con la tipografía de respaldo.
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}