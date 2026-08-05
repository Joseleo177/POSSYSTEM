import { fmtDate, resolveImageUrl } from ".";

// Segunda maqueta del ticket, en tamaño carta. La de caja (printReceipt, en ReceiptModal)
// está hecha para rollo térmico — @page de 58/80mm y alto automático — y al guardarla como
// PDF sale una tira larga y angosta que en WhatsApp se ve como una franja ilegible. Esta
// versión existe solo para el envío digital: la impresión de caja sigue usando la térmica.
//
// Lleva exactamente los mismos campos que el ticket térmico, con las mismas etiquetas. Lo
// que cambia es el reparto: la térmica apila todo en una columna porque el rollo mide 80mm,
// mientras que aquí hay 216mm de ancho y apilar deja media hoja en blanco. Si se agrega un
// dato al ticket, va aquí también — no debe haber nada en el PDF que el cliente no vea
// impreso en caja.
//
// Los totales llegan ya calculados por ReceiptModal para no duplicar la lógica de tasa y
// moneda: el PDF muestra los mismos números que el cajero tiene en pantalla.

const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function printInvoiceLetter({ sale, totals, companyInfo }) {
    const s = sale;
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const invoiceLabel = s.invoice_number || `#${s.id}`;
    const showHeader = companyInfo?.show_header !== false;
    const hasCustomer = !!(s.customer_name || s.customer_rif);

    const itemsRows = totals.items.map(i => {
        const qty = parseFloat(i.quantity || 1);
        return `
        <tr>
            <td class="item-name">${esc(i.name || i.product_name || "")}</td>
            <td class="td-center">x ${qty % 1 === 0 ? Math.round(qty) : qty}</td>
            <td class="td-right">${i.fmtPrice}</td>
            <td class="td-right td-total">${i.fmtSubtotal}</td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF",
         así que lleva tienda y número: el cliente recibe "Recibo A-0048 - Mi Tienda.pdf". -->
    <title>Recibo ${esc(invoiceLabel)} - ${esc(storeName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');

        @page { size: letter; margin: 14mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 12px;
            line-height: 1.45;
            color: #1a1a1a;
            background: #fff;
        }
        /* A diferencia de la térmica (1 bit, sin grises), aquí el destino es PDF o láser:
           los grises sí se imprimen y sirven para separar cabecera, tabla y totales. */

        /* La hoja se estira al alto imprimible (letter 279mm - 28mm de márgenes) y el
           contenido crece en el medio, así el pie queda anclado abajo en vez de dejar un
           tercio de página en blanco entre el total y el agradecimiento. */
        .sheet { min-height: 251mm; display: flex; flex-direction: column; }
        .body-area { flex: 1; }

        /* ── Cabecera: identidad a la izquierda, documento a la derecha ── */
        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; }
        .brand { display: flex; gap: 16px; align-items: flex-start; flex: 1; }
        .logo { max-height: 80px; max-width: 160px; object-fit: contain; }
        .store-name { font-size: 27px; font-weight: 800; text-transform: uppercase; line-height: 1.05; letter-spacing: -0.5px; }
        .store-slogan { font-size: 11.5px; font-style: italic; color: #555; margin-top: 3px; }
        .store-rif { font-size: 12.5px; font-weight: 700; margin-top: 7px; }
        .store-info { font-size: 11.5px; color: #444; margin-top: 3px; line-height: 1.55; }

        .doc-box { text-align: right; white-space: nowrap; }
        .doc-title { font-size: 21px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; line-height: 1; }
        .doc-warning { font-size: 9px; font-weight: 700; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
        .doc-number { font-size: 20px; font-weight: 800; margin-top: 12px; letter-spacing: -0.5px; }
        .doc-number-label { font-size: 9px; font-weight: 800; letter-spacing: 1.5px; color: #888; text-transform: uppercase; }
        .doc-date { font-size: 11.5px; color: #444; margin-top: 2px; }

        /* ── Datos: dos tarjetas al ancho completo ── */
        .parties { display: flex; gap: 16px; margin: 20px 0; }
        .party { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 11px 15px; }
        .party-label { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: #888; margin-bottom: 4px; }
        .party-name { font-size: 14px; font-weight: 700; text-transform: uppercase; line-height: 1.3; }
        .party-line { font-size: 11.5px; color: #444; }

        table { width: 100%; border-collapse: collapse; }
        thead { background: #f2f2f2; }
        th { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 10px 12px; text-align: left; border-bottom: 2px solid #1a1a1a; }
        td { padding: 11px 12px; font-size: 12px; vertical-align: middle; border-bottom: 1px solid #eee; }
        /* En carta hay ancho de sobra: el nombre del producto va completo, sin el recorte
           a 32mm que obliga la térmica. */
        .item-name { font-weight: 600; text-transform: uppercase; word-break: break-word; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 90px; }
        .td-right, th.td-right { text-align: right; white-space: nowrap; width: 130px; }
        .td-total { font-weight: 800; }
        tbody tr:nth-child(even) { background: #fafafa; }

        .totals { width: 320px; margin-left: auto; margin-top: 18px; }
        .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 5px 14px; font-size: 12.5px; }
        .total-row.big { font-size: 19px; font-weight: 800; border-top: 2.5px solid #1a1a1a; margin-top: 5px; padding-top: 11px; padding-bottom: 11px; background: #f2f2f2; letter-spacing: -0.5px; }
        .total-row.discount { color: #b40000; }

        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; text-align: center; font-size: 10.5px; color: #666; }
    </style>
</head>
<body>
<div class="sheet">
<div class="body-area">

    <div class="top">
        <div class="brand">
            ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
            <div>
                <div class="store-name">${esc(storeName)}</div>
                ${showHeader ? `
                ${companyInfo?.slogan ? `<div class="store-slogan">"${esc(companyInfo.slogan)}"</div>` : ""}
                ${companyInfo?.rif ? `<div class="store-rif">RIF: ${esc(companyInfo.rif)}</div>` : ""}
                <div class="store-info">
                    ${[companyInfo.address, companyInfo.city].filter(Boolean).map(esc).join(", ")}
                    ${(companyInfo?.phone || companyInfo?.phone2) ? `<br>${[companyInfo.phone, companyInfo.phone2].filter(Boolean).map(esc).join(" / ")}` : ""}
                </div>` : ""}
            </div>
        </div>

        <div class="doc-box">
            <div class="doc-title">Ticket de caja</div>
            <div class="doc-warning">*** Documento no fiscal ***</div>
            <div class="doc-number-label">Recibo</div>
            <div class="doc-number">${esc(invoiceLabel)}</div>
            <div class="doc-date">${esc(fmtDate(s.created_at))}</div>
        </div>
    </div>

    ${(hasCustomer || s.employee_name) ? `
    <div class="parties">
        ${hasCustomer ? `
        <div class="party">
            <div class="party-label">Cliente</div>
            ${s.customer_name ? `<div class="party-name">${esc(s.customer_name)}</div>` : ""}
            ${s.customer_rif ? `<div class="party-line">C.I./RIF: ${esc(s.customer_rif)}</div>` : ""}
        </div>` : ""}
        ${s.employee_name ? `
        <div class="party">
            <div class="party-label">Cajero</div>
            <div class="party-name">${esc(s.employee_name)}</div>
        </div>` : ""}
    </div>` : `<div style="height:20px"></div>`}

    <table>
        <thead>
            <tr>
                <th>Producto</th>
                <th class="td-center">Cant</th>
                <th class="td-right">P.U.</th>
                <th class="td-right">Total</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>SUBTOTAL</span><span>${totals.fmtSubtotal}</span></div>
        ${s.discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${totals.fmtDiscount}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${totals.fmtTotal}</span></div>
    </div>

</div>

    <div class="footer">${companyInfo?.footer || "¡Gracias por su compra!"}</div>
</div>
</body>
</html>`;

    // Mismo iframe oculto que usa el ticket: no abre pestaña nueva y no lo frenan los
    // bloqueadores de popup. El ancho imita una hoja carta (816px a 96dpi) para que el
    // layout se calcule igual que en el papel antes de abrir el diálogo.
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