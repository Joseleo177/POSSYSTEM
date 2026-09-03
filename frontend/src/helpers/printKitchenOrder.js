import { fmtDate } from ".";

// Texto que viene de fuera (nombre y nota que teclea el cliente en el catálogo público)
// se pega dentro del HTML del ticket: sin escapar, un "<" en una nota rompe la comanda.
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// La cantidad se lee de reojo mientras se cocina: los enteros van sin decimales y los
// pesados (0.750 KG) conservan los suyos, igual que en el resto del sistema.
const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : String(n);
};

/**
 * Comanda de una cuenta en espera o de un pedido del catálogo.
 *
 * Sale por la misma impresora térmica que el ticket de caja, así que usa el mismo ancho de
 * papel (`printerWidth`). Nunca lleva importes: este papel se despacha —cocina, barra o el
 * propio cliente para revisar su pedido— y ahí el precio no se usa. La cuenta con montos es
 * el ticket de caja, que se imprime al cobrar.
 *
 * @param {object} order        venta en estado 'espera' o 'pedido' (tal como la lista el modal)
 * @param {object} companyInfo  datos de la tienda
 * @param {number} printerWidth 58 u 80 (mm)
 */
export function printKitchenOrder(order, companyInfo, printerWidth = 80) {
    const w58 = printerWidth === 58;

    const isWebOrder = order.status === "pedido";
    const customer = order.customer_name || order.web_customer_name || "Cliente General";
    const items = order.items || [];
    const totalUnidades = items.reduce((acc, i) => acc + (parseFloat(i.quantity) || 0), 0);
    const ref = order.invoice_number || `#${order.id}`;

    // La nota de la línea va bajo el nombre, dentro de la misma celda: una columna aparte
    // para "sin cebolla" desperdiciaría un ancho fijo en las líneas que no llevan nota, y en
    // una térmica de 58mm no sobra ancho para regalar.
    const rows = items.map(i => `
        <tr>
            <td class="qty">${fmtQty(i.quantity)}</td>
            <td class="name">${esc(i.name)}${i.note ? `<div class="line-note">${esc(i.note)}</div>` : ""}</td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Comanda ${esc(ref)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            line-height: 1.25;
            color: #000;
            background: #fff;
            width: ${w58 ? "44mm" : "72mm"};
            margin: ${w58 ? "0" : "0 auto"};
            padding: ${w58 ? "2mm" : "3mm"};
        }
        .head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 1.5mm; margin-bottom: 2mm; }
        .store { font-size: ${w58 ? "8px" : "10px"}; font-weight: 700; text-transform: uppercase; }
        .title { font-size: ${w58 ? "14px" : "18px"}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
        .tag { display: inline-block; margin-top: 0.5mm; border: 1px solid #000; padding: 0 1.5mm; font-size: ${w58 ? "7px" : "9px"}; font-weight: 800; text-transform: uppercase; }

        .meta { font-size: ${w58 ? "8px" : "10px"}; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px dashed #000; }
        .meta-row { display: flex; justify-content: space-between; gap: 2mm; }
        .meta-row span:last-child { font-weight: 700; text-align: right; }
        /* El nombre del cliente es lo que se canta al entregar: va tan grande como el título. */
        .customer { font-size: ${w58 ? "11px" : "14px"}; font-weight: 800; text-transform: uppercase; margin-top: 1mm; }
        .customer-label { font-size: ${w58 ? "7px" : "8.5px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }

        table { width: 100%; border-collapse: collapse; }
        /* Sin grises: la térmica es de 1 bit y un #444 sale lavado (mismo criterio que el ticket). */
        td { padding: 1.2mm 0; font-size: ${w58 ? "10px" : "12px"}; vertical-align: top; border-bottom: 1px dotted #000; color: #000; }
        td.qty { font-size: ${w58 ? "12px" : "15px"}; font-weight: 800; width: ${w58 ? "8mm" : "10mm"}; white-space: nowrap; }
        /* overflow-wrap y no word-break: este parte la palabra siempre que el renglón se
           acabe, y "CAFE AMANECER" salía cortado en tres pedazos letra a letra. Así solo se
           parte la palabra que de verdad no cabe entera. */
        td.name { font-weight: 700; text-transform: uppercase; overflow-wrap: break-word; }
        /* Sin mayúsculas ni negrita: distingue la nota del plato de un vistazo, y en
           mayúscula "SIN CEBOLLA" se confunde con el nombre del propio plato. */
        .line-note { font-weight: 500; text-transform: none; font-style: italic; margin-top: 0.5mm; }

        .note { margin-top: 2mm; border: 1px solid #000; padding: 1.5mm; font-size: ${w58 ? "9px" : "11px"}; font-weight: 700; overflow-wrap: break-word; }
        .note-label { font-size: ${w58 ? "7px" : "8.5px"}; letter-spacing: 1px; text-transform: uppercase; }
        .foot { margin-top: 2mm; padding-top: 1.5mm; border-top: 2px solid #000; text-align: center; font-size: ${w58 ? "9px" : "11px"}; font-weight: 800; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="head">
        ${companyInfo?.name ? `<div class="store">${esc(companyInfo.name)}</div>` : ""}
        <div class="title">Comanda</div>
        ${isWebOrder ? `<div class="tag">Pedido Web</div>` : ""}
    </div>

    <div class="meta">
        <div class="meta-row"><span>Orden:</span><span>${esc(ref)}</span></div>
        <div class="meta-row"><span>Fecha:</span><span>${esc(fmtDate(order.created_at))}</span></div>
        ${order.employee_name ? `<div class="meta-row"><span>Atiende:</span><span>${esc(order.employee_name)}</span></div>` : ""}
        ${order.web_customer_phone ? `<div class="meta-row"><span>Teléfono:</span><span>${esc(order.web_customer_phone)}</span></div>` : ""}
        <div class="customer-label" style="margin-top:1.5mm">Cliente</div>
        <div class="customer">${esc(customer)}</div>
    </div>

    <table><tbody>${rows}</tbody></table>

    ${order.web_note ? `<div class="note"><div class="note-label">Nota</div>${esc(order.web_note)}</div>` : ""}

    <div class="foot">${items.length} ${items.length === 1 ? "línea" : "líneas"} · ${fmtQty(totalUnidades)} und.</div>
</body>
</html>`;

    // Iframe oculto en vez de window.open: la caja suele tener bloqueador de ventanas y una
    // pestaña nueva por comanda deja al cajero cerrando ventanas en plena hora pico.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:300px;height:1200px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
    };
}
