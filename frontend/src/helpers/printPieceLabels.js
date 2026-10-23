import { buildBarcode, barcodeBars } from "./barcode";
import { printHtml } from "./printDocument";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtM = (mm) => (Number(mm) / 1000).toLocaleString("es-VE", { maximumFractionDigits: 3 });
const fmtN = (n) => Number(n || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });
const unidad = (u) => (String(u || "").toUpperCase() === "M2" ? "m²" : "m");

/**
 * Etiquetas de piezas y retazos en la térmica de tickets: una por pieza, para pegarla sobre el
 * material. Lleva el número grande (es lo que se dicta en el taller), el material, las medidas
 * y el código de barras del número para escanearlo al entregar.
 *
 * @param {Array}  pieces        [{ code, product_name, unit, width_mm, length_mm, is_irregular, size }]
 * @param {number} printerWidth  58 u 80 (mm)
 */
export function printPieceLabels(pieces, printerWidth = 80) {
    const w58 = printerWidth === 58;
    const labels = (pieces || []).map(p => {
        const bc = buildBarcode(p.code);
        const bars = bc ? barcodeBars(bc.bits) : [];
        const svg = bc ? `
            <svg viewBox="0 0 ${bc.bits.length} 100" preserveAspectRatio="none" class="bars">
                ${bars.map(b => `<rect x="${b.x}" y="0" width="${b.width}" height="100" fill="#000"/>`).join("")}
            </svg>` : "";
        const tam = `${fmtN(p.size)} ${unidad(p.unit)}`;
        const medidas = p.is_irregular ? `Irregular · ${tam}`
            : p.width_mm ? `${fmtM(p.width_mm)} × ${fmtM(p.length_mm)} m · ${tam}`
            : `${fmtM(p.length_mm)} m`;
        return `
            <section class="label">
                <div class="code">#${esc(p.code)}</div>
                <div class="mat">${esc(p.product_name)}</div>
                <div class="dims">${esc(medidas)}</div>
                ${svg}
            </section>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Etiquetas de piezas</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        body { font-family: Arial, Helvetica, sans-serif; color: #000; width: ${w58 ? "58mm" : "80mm"}; }
        .label { padding: 3mm 3mm 4mm; border-bottom: 1px dashed #000; page-break-after: always; break-after: page; }
        .label:last-child { page-break-after: auto; break-after: auto; }
        .code { font-size: ${w58 ? "28px" : "36px"}; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
        .mat { font-size: ${w58 ? "11px" : "13px"}; font-weight: 700; margin-top: 2mm; }
        .dims { font-size: ${w58 ? "11px" : "12px"}; margin-top: 1mm; }
        .bars { display: block; width: 100%; height: ${w58 ? "11mm" : "13mm"}; margin-top: 2mm; }
    </style>
</head>
<body>${labels}</body>
</html>`;

    printHtml(html, { width: w58 ? 220 : 300, height: 400 });
}
