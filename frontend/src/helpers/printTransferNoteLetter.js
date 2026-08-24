import { fmtDate, resolveImageUrl } from ".";
import { fmtQtyUnit } from "./unitFormatter";

// Nota de despacho en tamaño carta, hermana de printTransferNote. La maqueta térmica está
// hecha para el rollo que viaja grapado al bulto; esta es la que se archiva y se envía: el
// respaldo de que la mercancía salió de un almacén y entró en otro, con quién firmó cada
// punta. Guardada como PDF desde el diálogo de impresión sale una hoja legible, no la tira
// angosta de 80mm.
//
// Nunca lleva precios, igual que la térmica: es un documento de mercancía, no de venta.
//
// La columna "Recibido" cambia según el estado del documento —y esa es toda la gracia—:
// mientras está en tránsito va en blanco, para contar a mano contra el papel; una vez
// recibida imprime lo que realmente entró y señala los faltantes. El mismo formato sirve de
// guía de despacho antes y de acta de recepción después.

const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const STATUS_LABEL = {
    sent:                      "En tránsito · pendiente de recibir",
    received:                  "Recibida conforme",
    received_with_differences: "Recibida con faltantes",
    cancelled:                 "Anulada",
};

export function printTransferNoteLetter(transfer, companyInfo) {
    const storeName  = companyInfo?.name || "MI TIENDA POS";
    const showHeader = companyInfo?.show_header !== false;

    const items    = transfer?.items || [];
    const enCurso  = transfer?.status === "sent";
    const anulada  = transfer?.status === "cancelled";
    const docNumber = transfer?.code || `#${transfer?.id ?? ""}`;

    const itemsRows = items.map((i, idx) => {
        const sent     = parseFloat(i.qty_sent || 0);
        const received = i.qty_received == null ? null : parseFloat(i.qty_received);
        const missing  = received == null ? 0 : sent - received;

        // En tránsito la casilla va vacía a propósito: la llena quien cuenta.
        const recibido = enCurso || received == null
            ? `<span class="checkbox"></span>`
            : `<span class="${missing > 0 ? "qty-short" : "qty-ok"}">${esc(fmtQtyUnit(received, i.unit))}</span>`;

        const faltante = missing > 0
            ? `<div class="line-note">Faltaron ${esc(fmtQtyUnit(missing, i.unit))}${i.diff_reason ? ` · ${esc(i.diff_reason)}` : ""}${
                  i.resolved_at ? ` · ${i.diff_resolution === "return" ? "Devuelto al origen" : "Cargado como merma"}` : ""
              }</div>`
            : "";

        return `
        <tr>
            <td class="td-num">${idx + 1}</td>
            <td class="item-name">${esc(i.product_name || "")}${faltante}</td>
            <td class="td-center">${esc(fmtQtyUnit(sent, i.unit))}</td>
            <td class="td-center">${recibido}</td>
        </tr>`;
    }).join("");

    const issuerLine = [
        companyInfo?.rif ? `RIF: ${esc(companyInfo.rif)}` : "",
        [companyInfo?.address, companyInfo?.city].filter(Boolean).map(esc).join(", "),
        [companyInfo?.phone, companyInfo?.phone2].filter(Boolean).map(esc).join(" / "),
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>Nota de Despacho ${esc(docNumber)} - ${esc(storeName)}</title>
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
        .route { display: flex; align-items: center; gap: 12px; }
        .route-wh { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1a1a1a; }
        .route-arrow { font-size: 14px; color: #999; }
        .route-sub { font-size: 9.5px; color: #777; margin-top: 2px; }

        .meta { min-width: 245px; }
        .meta-row { display: flex; justify-content: space-between; gap: 24px; font-size: 10px; padding: 1.5px 0; }
        .meta-label { color: #777; }
        .meta-value { font-weight: 700; color: #1a1a1a; text-align: right; }

        table { width: 100%; border-collapse: collapse; }
        thead { background: #e9e9e9; }
        th { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 9px 12px; text-align: left; color: #444; }
        td { padding: 10px 12px; font-size: 10.5px; vertical-align: middle; border-bottom: 1px solid #ededed; }
        .item-name { color: #2b2b2b; overflow-wrap: break-word; }
        .line-note { font-size: 9px; color: #a33; margin-top: 2px; }
        .td-num { width: 34px; color: #999; font-size: 9.5px; text-align: right; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 120px; }
        .qty-ok { font-weight: 700; color: #1a1a1a; }
        .qty-short { font-weight: 700; color: #a33; }
        .checkbox { display: inline-block; width: 15px; height: 15px; border: 1.5px solid #555; border-radius: 3px; }

        .summary { margin-top: 14px; padding: 9px 12px; background: #e9e9e9; display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700; color: #1a1a1a; }

        .notes { margin-top: 22px; }
        .notes-text { font-size: 10px; color: #666; white-space: pre-wrap; }

        .voided { margin-top: 22px; padding: 10px 12px; border: 1.5px solid #a33; color: #a33; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; text-align: center; }

        .signs { display: flex; gap: 60px; margin-top: 46px; }
        .sign { flex: 1; text-align: center; }
        .sign-line { border-top: 1px solid #555; margin-bottom: 4px; }
        .sign-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #777; }
        .sign-name { font-size: 9.5px; color: #555; margin-top: 2px; }

        .footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9.5px; color: #999; }
    </style>
</head>
<body>
<div class="sheet">
<div class="body-area">

    <div class="top">
        <div>
            <div class="doc-title">Nota de Despacho</div>
            <div class="doc-warning">Documento interno · No fiscal · ${esc(STATUS_LABEL[transfer?.status] || "")}</div>
        </div>
        ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
    </div>

    <div class="issuer">
        <span class="issuer-name">${esc(storeName)}</span>
        ${showHeader && companyInfo?.slogan ? `<span class="issuer-slogan"> · "${esc(companyInfo.slogan)}"</span>` : ""}
        ${showHeader && issuerLine ? `<div class="issuer-line">${issuerLine}</div>` : ""}
    </div>

    <div class="info">
        <div>
            <div class="block-label">Traslado</div>
            <div class="route">
                <span class="route-wh">${esc(transfer?.from_warehouse_name || "Externo")}</span>
                <span class="route-arrow">&rarr;</span>
                <span class="route-wh">${esc(transfer?.to_warehouse_name || "—")}</span>
            </div>
            <div class="route-sub">Almacén de origen &rarr; almacén de destino</div>
        </div>
        <div class="meta">
            <div class="meta-row"><span class="meta-label">Transferencia N°:</span><span class="meta-value">${esc(docNumber)}</span></div>
            <div class="meta-row"><span class="meta-label">Despachada:</span><span class="meta-value">${esc(fmtDate(transfer?.dispatched_at || transfer?.created_at))}</span></div>
            ${transfer?.employee_name ? `<div class="meta-row"><span class="meta-label">Despachó:</span><span class="meta-value">${esc(transfer.employee_name)}</span></div>` : ""}
            ${transfer?.received_at ? `<div class="meta-row"><span class="meta-label">Recibida:</span><span class="meta-value">${esc(fmtDate(transfer.received_at))}</span></div>` : ""}
            ${transfer?.received_by_name ? `<div class="meta-row"><span class="meta-label">Recibió:</span><span class="meta-value">${esc(transfer.received_by_name)}</span></div>` : ""}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Producto</th>
                <th class="td-center">Despachado</th>
                <th class="td-center">Recibido</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="summary">
        <span>${items.length} ${items.length === 1 ? "producto" : "productos"}</span>
        <span>${enCurso ? "Cuente la mercancía antes de firmar" : `Total despachado: ${esc(String(transfer?.total_sent ?? ""))}`}</span>
    </div>

    ${anulada ? `<div class="voided">Documento anulado${transfer?.cancel_reason ? ` · ${esc(transfer.cancel_reason)}` : ""}</div>` : ""}

    ${transfer?.note ? `
    <div class="notes">
        <div class="block-label">Motivo del traslado</div>
        <div class="notes-text">${esc(transfer.note)}</div>
    </div>` : ""}

    ${transfer?.receipt_note ? `
    <div class="notes">
        <div class="block-label">Observaciones de la recepción</div>
        <div class="notes-text">${esc(transfer.receipt_note)}</div>
    </div>` : ""}

    <div class="signs">
        <div class="sign">
            <div class="sign-line"></div>
            <div class="sign-label">Entrega</div>
            ${transfer?.employee_name ? `<div class="sign-name">${esc(transfer.employee_name)}</div>` : ""}
        </div>
        <div class="sign">
            <div class="sign-line"></div>
            <div class="sign-label">Recibe conforme</div>
            ${transfer?.received_by_name ? `<div class="sign-name">${esc(transfer.received_by_name)}</div>` : ""}
        </div>
    </div>

</div>

    <div class="footer">${esc(storeName)} · Impreso el ${esc(fmtDate(new Date()))}</div>
</div>
</body>
</html>`;

    // Mismo iframe oculto que los demás documentos carta: sin pestaña nueva y sin depender de
    // que el navegador permita emergentes. 816px es el ancho exacto de la hoja carta a 96dpi.
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
