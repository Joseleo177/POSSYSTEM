import { resolveImageUrl } from ".";
import { fmtQtyUnit } from "./unitFormatter";

const fmtDate = d => d ? new Date(d).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Nota de despacho: el papel que viaja CON la mercancía y contra el que el almacén destino
 * cuenta lo que llegó. Nunca lleva precios —es un documento de mercancía, no de venta— y la
 * columna "Recibido" va en blanco a propósito: la llena a mano quien recibe, antes de
 * confirmar la recepción en el sistema.
 *
 * @param {object} transfer      cabecera con code, almacenes, responsable y notas
 * @param {object} companyInfo   datos de la tienda
 * @param {number} printerWidth  58 u 80 (mm)
 */
export function printTransferNote(transfer, companyInfo, printerWidth = 80) {
    const w58 = printerWidth === 58;
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const items = transfer?.items || [];

    const itemsRows = items.map((i, idx) => `
        <tr>
            <td class="td-num">${idx + 1}</td>
            <td><div class="item-name">${i.product_name || ""}</div></td>
            <td class="td-center"><b>${fmtQtyUnit(i.qty_sent, i.unit)}</b></td>
            <td class="td-check"><span class="checkbox"></span></td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>NOTA DE DESPACHO</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: ${w58 ? "8px" : "11px"};
            line-height: 1.3;
            color: #000;
            background: white;
            /* Ancho sobre el ÁREA IMPRIMIBLE, no sobre el papel: el rollo de 80mm imprime 72
               y el de 58 imprime 44. */
            width: ${w58 ? "44mm" : "72mm"};
            margin: ${w58 ? "0" : "0 auto"};
            padding: ${w58 ? "2mm" : "3mm"};
        }
        .header { display: flex; align-items: flex-start; gap: ${w58 ? "4px" : "8px"}; margin-bottom: ${w58 ? "6px" : "10px"}; border-bottom: 2px solid #000; padding-bottom: ${w58 ? "5px" : "8px"}; }
        .logo { max-height: ${w58 ? "35px" : "50px"}; max-width: ${w58 ? "55px" : "80px"}; object-fit: contain; }
        .header-content { flex: 1; min-width: 0; }
        .store-name { font-size: ${w58 ? "10px" : "14px"}; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-info { font-size: ${w58 ? "7px" : "9px"}; line-height: 1.2; font-weight: 600; }
        .doc-header { text-align: center; margin: ${w58 ? "5px" : "8px"} 0; }
        .doc-title  { font-size: ${w58 ? "10px" : "14px"}; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-sub    { font-size: ${w58 ? "7px" : "9px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
        .route { border: 1.5px solid #000; border-radius: 4px; padding: ${w58 ? "4px 5px" : "6px 8px"}; margin-bottom: ${w58 ? "5px" : "8px"}; text-align: center; }
        .route-wh { font-size: ${w58 ? "9px" : "12px"}; font-weight: 800; text-transform: uppercase; }
        .route-arrow { font-size: ${w58 ? "8px" : "10px"}; font-weight: 700; margin: 1px 0; }
        .meta { margin-bottom: ${w58 ? "5px" : "8px"}; font-size: ${w58 ? "8px" : "10.5px"}; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; gap: 4px; }
        .meta-label { font-weight: 600; }
        .meta-value { font-weight: 800; text-align: right; max-width: 60%; }
        .notes { margin-bottom: ${w58 ? "5px" : "8px"}; font-size: ${w58 ? "7.5px" : "9.5px"}; border: 1px solid #000; border-radius: 4px; padding: 5px 7px; }
        .notes-label { font-weight: 800; text-transform: uppercase; font-size: ${w58 ? "7px" : "8px"}; letter-spacing: 0.5px; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: ${w58 ? "5px" : "8px"}; }
        th { font-size: ${w58 ? "7px" : "9px"}; font-weight: 800; text-transform: uppercase; padding: ${w58 ? "4px 2px" : "6px 3px"}; text-align: left; border-bottom: 1.5px solid #000; border-top: 1.5px solid #000; }
        th:nth-child(1) { width: 16px; }
        th:nth-child(3) { text-align: center; }
        th:nth-child(4) { text-align: center; width: ${w58 ? "26px" : "32px"}; }
        td { padding: ${w58 ? "3px 2px" : "5px 3px"}; font-size: ${w58 ? "8px" : "10px"}; vertical-align: middle; border-bottom: 1px dashed #000; }
        .item-name { font-weight: 700; line-height: 1.2; }
        .td-num    { font-weight: 700; font-size: ${w58 ? "7px" : "9px"}; text-align: right; padding-right: 5px; }
        .td-center { text-align: center; }
        .td-check  { text-align: center; }
        .checkbox  { display: inline-block; width: ${w58 ? "11px" : "14px"}; height: ${w58 ? "11px" : "14px"}; border: 1.5px solid #000; border-radius: 2px; }
        .summary   { border-top: 1.5px solid #000; padding-top: 6px; font-size: ${w58 ? "8px" : "10px"}; font-weight: 700; text-align: center; }
        .signs { display: flex; gap: ${w58 ? "6px" : "10px"}; margin-top: ${w58 ? "14px" : "20px"}; }
        .sign { flex: 1; text-align: center; }
        .sign-line { border-top: 1px solid #000; margin-bottom: 2px; }
        .sign-label { font-size: ${w58 ? "6.5px" : "8px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
        .footer { text-align: center; margin-top: 12px; font-size: ${w58 ? "7px" : "9px"}; font-weight: 600; border-top: 1px dashed #000; padding-top: 8px; }
    </style>
</head>
<body>
    <div class="header">
        ${companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
        <div class="header-content">
            <div class="store-name">${storeName}</div>
            <div class="store-info">
                ${companyInfo?.rif ? `<div>RIF: ${companyInfo.rif}</div>` : ""}
                ${companyInfo?.phone ? `<div>Tel: ${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}</div>` : ""}
            </div>
        </div>
    </div>

    <div class="doc-header">
        <div class="doc-title">Nota de Despacho</div>
        <div class="doc-sub">Documento interno · No fiscal</div>
    </div>

    <div class="route">
        <div class="route-wh">${transfer?.from_warehouse_name || "Externo"}</div>
        <div class="route-arrow">&darr;</div>
        <div class="route-wh">${transfer?.to_warehouse_name || "—"}</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span class="meta-label">Transferencia Nº:</span><span class="meta-value">${transfer?.code || `#${transfer?.id ?? ""}`}</span></div>
        <div class="meta-row"><span class="meta-label">Despachada:</span><span class="meta-value">${fmtDate(transfer?.dispatched_at || transfer?.created_at)}</span></div>
        ${transfer?.employee_name ? `<div class="meta-row"><span class="meta-label">Despachado por:</span><span class="meta-value">${transfer.employee_name}</span></div>` : ""}
    </div>

    ${transfer?.note ? `<div class="notes"><div class="notes-label">Motivo / Notas</div>${transfer.note}</div>` : ""}

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Despachado</th>
                <th>Recibido</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="summary">${items.length} ${items.length === 1 ? "producto despachado" : "productos despachados"}</div>

    <div class="signs">
        <div class="sign"><div class="sign-line"></div><div class="sign-label">Entrega</div></div>
        <div class="sign"><div class="sign-line"></div><div class="sign-label">Recibe conforme</div></div>
    </div>

    <div class="footer">Cuente la mercancía antes de firmar · ${storeName}</div>
</body>
</html>`;

    // Iframe oculto en vez de window.open: no depende de que el navegador permita emergentes
    // ni deja una pestaña abierta si se cancela el diálogo de impresión.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:400px;height:1200px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}
