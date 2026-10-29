import { encodeQr, qrSvgPath } from "../../helpers/qrcode";
import { printHtml } from "../../helpers/printDocument";
import { esc } from "../../helpers/printReportBase";

// Hoja de QR de las mesas: una tarjeta por mesa, seis por hoja carta, para recortar y poner en
// un portacartas. Cada QR abre /mesa/<código>: el cliente ve cómo va su pedido y pide la cuenta.
// SVG y no imagen: sale nítido al tamaño que sea (mismo criterio que el cartel del catálogo).

const BORDER = 4;   // margen blanco que pide la norma, en módulos

export const urlDeMesa = (token) => `${window.location.origin}/mesa/${token}`;

export function printMesaQrs({ storeName, areaName, tables }) {
    const tarjetas = tables.filter(t => t.public_token).map(t => {
        const qr = encodeQr(urlDeMesa(t.public_token));
        const n = qr.size + BORDER * 2;
        return `
        <div class="card">
            <div class="store">${esc(storeName)}</div>
            <div class="mesa">${esc(t.name)}</div>
            <svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
                <path fill="#000" d="${qrSvgPath(qr, BORDER)}"/>
            </svg>
            <div class="cta">Escanea para ver cómo va tu pedido</div>
            <div class="sub">y pedir la cuenta desde tu teléfono</div>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>QR de las mesas · ${esc(areaName || storeName)}</title>
    <style>
        @page { size: letter; margin: 0.4in; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #111827; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3in; }
        .card { border: 1px dashed #9ca3af; border-radius: 12px; padding: 0.25in 0.2in; text-align: center;
                height: 3.25in; break-inside: avoid; page-break-inside: avoid;
                display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .store { font-size: 10pt; font-weight: 600; color: #6b7280; overflow-wrap: anywhere; }
        .mesa { font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; margin-top: 2pt; }
        svg { display: block; width: 1.75in; height: 1.75in; margin: 6pt auto 4pt; }
        .cta { font-size: 11pt; font-weight: 600; color: #374151; }
        .sub { font-size: 9pt; color: #6b7280; margin-top: 1pt; }
    </style>
</head>
<body>
    <div class="grid">${tarjetas}</div>
</body>
</html>`;
    printHtml(html);
}
