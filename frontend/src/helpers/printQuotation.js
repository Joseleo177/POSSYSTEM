import { fmtMoney, fmtDate, resolveImageUrl } from ".";

// printerWidth viene de la configuración de la tienda (58 u 80 mm). Sin él, el documento
// se maquetaba siempre a 80mm y en una impresora de 58 salía cortado por el lado derecho.
export function printQuotationDoc(quot, companyInfo, baseCurrency, activeCurrencies, printerWidth = 80) {
    const w58 = printerWidth === 58;
    // El presupuesto se expresa en la moneda base (divisa), no en Bs. Antes era al revés y
    // el papel no aguantaba los 30 días que él mismo declara de validez: el precio en Bs.
    // envejece con cada movimiento de tasa, y al reimprimir salía convertido con la tasa
    // guardada el día que se creó —una cifra que ya no correspondía ni al precio ni al
    // cambio del día—. El $ es lo que de verdad se pacta; los precios viven en base.
    const sym = baseCurrency?.symbol || "Ref.";
    // En prosa se nombra la moneda por su código (USD), no por el símbolo con que se rotulan
    // los importes: "el precio pactado es en Ref." no dice nada y queda impresentable en un
    // documento que va al cliente.
    const baseCode = baseCurrency?.code || sym;
    const fmtP = n => fmtMoney(parseFloat(n || 0), sym);

    // quotation_items.quantity es DECIMAL(14,4) y Sequelize lo entrega como texto: al pegarlo
    // crudo, un producto contable salía impreso como "8.0000". Los enteros van sin decimales
    // y los pesados (0.750 KG) conservan los suyos, sin ceros de relleno.
    const fmtQty = q => {
        const n = parseFloat(q || 0);
        return n % 1 === 0 ? String(Math.round(n)) : String(parseFloat(n.toFixed(3)));
    };

    // Equivalencia informativa en la moneda secundaria, con la tasa VIGENTE al imprimir (no
    // la de quot.exchange_rate), que es la única que le sirve al cliente que tiene el papel
    // en la mano.
    const secondary = activeCurrencies?.find(c => !c.is_base);
    const rateHoy = parseFloat(secondary?.exchange_rate || 0);
    const fmtSecondary = rateHoy > 1 ? n => fmtMoney(parseFloat(n || 0) * rateHoy, secondary.symbol) : null;
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const dateStr = fmtDate(quot.created_at);

    const itemsRows = (quot.items || []).map(i => `
        <tr>
            <td><div class="item-name">${i.product_name}</div></td>
            <td class="td-center">${fmtQty(i.quantity)}</td>
            <td class="td-right">${fmtP(i.price)}</td>
            <td class="td-right"><b>${fmtP(i.subtotal)}</b></td>
        </tr>
    `).join("");

    const total = parseFloat(quot.total || 0);
    const discount = parseFloat(quot.discount_amount || 0);
    const subtotalBeforeDiscount = total + discount;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Cotización #${quot.id}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: ${w58 ? "8px" : "11px"};
            line-height: 1.2;
            color: #000;
            background: white;
            /* Ancho en mm y sobre el ÁREA IMPRIMIBLE, igual que el ticket de caja: el rollo
               de 80mm imprime 72 y el de 58 imprime 44. Antes iba en píxeles (302px = 79.9mm,
               216px = 57.2mm), o sea el ancho total del papel: la térmica recortaba el
               documento por la derecha aunque el @page declarara el tamaño correcto. */
            width: ${w58 ? "44mm" : "72mm"};
            margin: ${w58 ? "0" : "0 auto"};
            padding: ${w58 ? "2mm" : "3mm"};
        }
        .header { display: flex; align-items: flex-start; gap: ${w58 ? "4px" : "8px"}; margin-bottom: ${w58 ? "6px" : "10px"}; border-bottom: 2px solid #000; padding-bottom: ${w58 ? "5px" : "8px"}; }
        .logo { max-height: ${w58 ? "35px" : "50px"}; max-width: ${w58 ? "55px" : "80px"}; object-fit: contain; }
        .header-content { flex: 1; text-align: left; }
        .store-name { font-size: ${w58 ? "10px" : "14px"}; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-rif { font-size: ${w58 ? "7.5px" : "10px"}; font-weight: 700; margin-bottom: 1px; }
        .store-slogan { font-size: ${w58 ? "7px" : "9px"}; font-weight: 700; font-style: italic; margin-bottom: 2px; }
        .store-info { font-size: ${w58 ? "7px" : "9px"}; line-height: 1.2; font-weight: 600; }
        .doc-header { text-align: center; margin: ${w58 ? "5px 0" : "8px 0"}; }
        .doc-title { font-size: ${w58 ? "10px" : "13px"}; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-warning { font-size: ${w58 ? "7px" : "9px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }
        .meta { margin-bottom: ${w58 ? "5px" : "8px"}; font-size: ${w58 ? "7.5px" : "10.5px"}; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { color: #000; font-weight: 600; }
        .meta-value { font-weight: 700; text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-bottom: ${w58 ? "5px" : "8px"}; }
        th { font-size: ${w58 ? "7px" : "9px"}; font-weight: 800; text-transform: uppercase; padding: ${w58 ? "4px 2px" : "6px 4px"}; text-align: left; border-bottom: 1.5px solid #000; }
        th:nth-child(2) { text-align: center; }
        th:nth-child(3), th:nth-child(4) { text-align: right; }
        td { padding: ${w58 ? "3px 2px" : "5px 4px"}; font-size: ${w58 ? "8px" : "10px"}; vertical-align: top; border-bottom: 0.5px dashed #000; }
        .item-name { font-weight: 600; line-height: 1.2; }
        .td-center { text-align: center; white-space: nowrap; }
        .td-right { text-align: right; white-space: nowrap; }
        .totals { border-top: 1.5px solid #000; padding-top: ${w58 ? "4px" : "6px"}; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: ${w58 ? "8px" : "11px"}; }
        .total-row.big { font-weight: 800; font-size: ${w58 ? "10px" : "14px"}; margin-top: 4px; padding-top: 4px; border-top: 1px solid #000; }
        .total-row.discount { font-style: italic; }
        /* Sin gris ni cursiva minúscula: la térmica es de 1 bit y un texto lavado a 6px no
           se lee, y esta nota es justo la que evita el reclamo cuando la tasa se movió. */
        .rate-note { margin-top: 3px; font-size: ${w58 ? "6.5px" : "8.5px"}; font-weight: 600; line-height: 1.2; text-align: right; }
        .footer { text-align: center; margin-top: ${w58 ? "10px" : "15px"}; font-size: ${w58 ? "7px" : "9px"}; color: #000; font-weight: 600; border-top: 1px dashed #000; padding-top: ${w58 ? "5px" : "8px"}; }
    </style>
</head>
<body>
    ${companyInfo?.show_header !== false ? `
    <div class="header">
        ${companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
        <div class="header-content">
            <div class="store-name">${storeName}</div>
            ${companyInfo?.slogan ? `<div class="store-slogan">"${companyInfo.slogan}"</div>` : ""}
            ${companyInfo?.rif ? `<div class="store-rif">RIF: ${companyInfo.rif}</div>` : ""}
            <div class="store-info">
                ${companyInfo?.address ? `<div>${companyInfo.address}</div>` : ""}
                ${companyInfo?.city ? `<span>${companyInfo.city}</span>` : ""}
                ${(companyInfo?.phone || companyInfo?.phone2) ? `<span> | ${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}</span>` : ""}
            </div>
        </div>
    </div>
    ` : ""}
    <div class="doc-header">
        <div class="doc-title">COTIZACIÓN</div>
        <div class="doc-warning">*** DOCUMENTO NO FISCAL / PRESUPUESTO ***</div>
    </div>
    <div class="meta">
        <div class="meta-row"><span class="meta-label">Cotización Nº:</span><span class="meta-value">#${quot.id}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr}</span></div>
        ${quot.customer_rif ? `<div class="meta-row"><span class="meta-label">CI/RIF:</span><span class="meta-value">${quot.customer_rif}</span></div>` : ""}
        ${quot.customer_name ? `<div class="meta-row"><span class="meta-label">Cliente:</span><span class="meta-value">${quot.customer_name}</span></div>` : ""}
    </div>
    <table>
        <thead>
            <tr><th>Producto</th><th>Cant</th><th>P.U.</th><th>Total</th></tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
        ${discount > 0 ? `<div class="total-row"><span>SUBTOTAL</span><span>${fmtP(subtotalBeforeDiscount)}</span></div>` : ""}
        ${discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${fmtP(discount)}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${fmtP(total)}</span></div>
        ${fmtSecondary ? `
        <div class="total-row" style="margin-top:2px;font-weight:700;justify-content:space-between;">
            <span>EQUIV. ${secondary.symbol}</span><span>${fmtSecondary(total)}</span>
        </div>
        <div class="rate-note">Precios expresados en ${baseCode}. Equivalente referencial a la tasa del día: ${fmtMoney(rateHoy, secondary.symbol)} por ${baseCode}</div>` : ""}
    </div>
    <div class="footer">${companyInfo?.footer || "Cotización válida por 30 días · ¡Gracias por su preferencia!"}</div>
</body>
</html>`;

    // Iframe oculto en vez de window.open, igual que el ticket de caja: la pestaña nueva se
    // queda abierta si el cajero cancela el diálogo, y en la caja suele haber bloqueador de
    // emergentes, que dejaba el botón de imprimir sin hacer nada.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:400px;height:1200px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        // La fuente y el logo llegan por red: sin la espera el diálogo se abre con el layout
        // a medio armar.
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}
