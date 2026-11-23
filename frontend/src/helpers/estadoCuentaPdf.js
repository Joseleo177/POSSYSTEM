// Estado de cuenta en PDF (Contactos → ficha → PDF), para mandárselo al cliente por WhatsApp o
// imprimirlo para cobrar. Reemplaza al botón "Imprimir", que sacaba la pantalla tal cual (barra
// de la tasa, menú, tarjetas) y solo la primera página de facturas (23-11-2026).
//
// Mismos datos que el Excel (GET /customers/:id/statement). El PDF es para quien recibe la
// cuenta: arriba la tienda y el saldo; después lo que se debe, documento por documento con su
// vencimiento; y al final los movimientos de los últimos 90 días (lo pagado), para que el cliente
// reconozca sus abonos. Texto real con jsPDF + autotable, como la lista de precios.
import { absoluta } from "./catalogPdf";

const M = 14, ANCHO = 210, ALTO = 297;
const DIAS_HISTORIAL = 90;

const hexRgb = (hex) => {
    const h = String(hex || "#111111").replace("#", "");
    const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return rgb.some(Number.isNaN) ? [17, 17, 17] : rgb;
};
// El color de la marca, oscurecido si es muy claro: sobre papel blanco un amarillo no se lee.
const tinta = (hex) => {
    const [r, g, b] = hexRgb(hex);
    const luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const k = luz > 0.6 ? 0.55 : 1;
    return [r, g, b].map(v => Math.round(v * k));
};
const fechaVE = (v) => (v ? new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v)) : "");
const fechaCorta = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const monto = (n, s) => `${s} ${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;

async function logoPng(url) {
    if (!url) return null;
    try {
        const resp = await fetch(absoluta(url), { mode: "cors", credentials: "omit" });
        if (!resp.ok) return null;
        const bmp = await createImageBitmap(await resp.blob());
        const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        return c.toDataURL("image/png");
    } catch {
        return null;   // sin logo el PDF sale igual
    }
}

/**
 * @param data   respuesta de /customers/:id/statement
 * @param tienda companyInfo de AppContext (nombre, RIF, dirección, teléfono, logo)
 * @param opts   { simbolo, color }
 * @returns Blob PDF
 */
export async function estadoCuentaAPdf(data, tienda = {}, { simbolo = "Ref.", color } = {}) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const { contacto, resumen, documentos } = data;
    const esProveedor = contacto.tipo === "proveedor";
    const acento = tinta(color);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

    // ── Cabecera: la tienda a la izquierda, el título y la fecha a la derecha ──
    let x = M;
    const logo = await logoPng(tienda.logo_url);
    if (logo) {
        const p = pdf.getImageProperties(logo);
        const h = 16, w = Math.min(36, (p.width / p.height) * h);
        pdf.addImage(logo, "PNG", M, 12, w, h);
        x = M + w + 5;
    }
    const nombreTienda = tienda.name || data.empresa?.nombre || "";
    pdf.setFont("helvetica", "bold").setFontSize(14).setTextColor(25, 25, 25).text(nombreTienda, x, 17);
    const datosTienda = [
        (tienda.rif || data.empresa?.rif) && `RIF ${tienda.rif || data.empresa.rif}`,
        (tienda.phone || data.empresa?.telefono) && `Tel. ${tienda.phone || data.empresa.telefono}`,
    ].filter(Boolean).join(" · ");
    pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(105, 105, 105);
    if (datosTienda) pdf.text(datosTienda, x, 22);
    const direccion = [tienda.address || data.empresa?.direccion, tienda.city].filter(Boolean).join(", ");
    if (direccion) pdf.text(pdf.splitTextToSize(direccion, 100).slice(0, 2), x, 26);

    pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(...acento).text("ESTADO DE CUENTA", ANCHO - M, 17, { align: "right" });
    pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(105, 105, 105).text(`Emitido el ${fechaVE(new Date())}`, ANCHO - M, 22, { align: "right" });

    let y = 34;
    pdf.setDrawColor(...acento).setLineWidth(0.6).line(M, y, ANCHO - M, y);
    y += 5;

    // ── Quién y cuánto: el contacto a la izquierda, el saldo en grande a la derecha ──
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 120, 120).text(esProveedor ? "PROVEEDOR" : "CLIENTE", M, y + 2);
    pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(25, 25, 25).text(pdf.splitTextToSize(contacto.nombre || "", 105)[0], M, y + 8);
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(70, 70, 70);
    const lineasContacto = [
        contacto.rif && `RIF / Cédula: ${contacto.rif}`,
        contacto.telefono && `Teléfono: ${contacto.telefono}`,
        `Plazo de pago: ${contacto.dias_credito ? `${contacto.dias_credito} días` : "de contado"}`,
    ].filter(Boolean);
    lineasContacto.forEach((t, i) => pdf.text(t, M, y + 13.5 + i * 4.6));

    const cajaW = 70, cajaX = ANCHO - M - cajaW, cajaH = 28;
    pdf.setFillColor(246, 246, 246).roundedRect(cajaX, y - 1, cajaW, cajaH, 2, 2, "F");
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(110, 110, 110)
        .text(esProveedor ? "LE DEBEMOS A LA FECHA" : "SALDO A LA FECHA", cajaX + cajaW - 4, y + 4.5, { align: "right" });
    pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(25, 25, 25).text(monto(resumen.saldo_pendiente, simbolo), cajaX + cajaW - 4, y + 13, { align: "right" });
    pdf.setFont("helvetica", "normal").setFontSize(8.5);
    if (resumen.vencido > 0.005) {
        pdf.setTextColor(200, 30, 30).text(`Vencido: ${monto(resumen.vencido, simbolo)}`, cajaX + cajaW - 4, y + 19, { align: "right" });
    } else {
        pdf.setTextColor(110, 110, 110).text(resumen.saldo_pendiente > 0.005 ? "Nada vencido" : "Al día", cajaX + cajaW - 4, y + 19, { align: "right" });
    }
    if (!esProveedor && resumen.saldo_a_favor > 0.005) {
        pdf.setTextColor(30, 120, 70).text(`Saldo a favor: ${monto(resumen.saldo_a_favor, simbolo)}`, cajaX + cajaW - 4, y + 24, { align: "right" });
    }
    y += Math.max(cajaH, 15 + lineasContacto.length * 4.6) + 6;

    const tabla = {
        theme: "plain",
        margin: { left: M, right: M, top: 14, bottom: 16 },
        styles: { font: "helvetica", fontSize: 8.6, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, textColor: [34, 34, 34], valign: "middle", overflow: "linebreak" },
        headStyles: { fontSize: 7.2, fontStyle: "bold", textColor: [100, 100, 100], fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: [190, 190, 190] },
        bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: [228, 228, 228] },
        showHead: "everyPage",
    };
    const titulo = (texto) => {
        if (y > ALTO - 40) { pdf.addPage(); y = 18; }
        pdf.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(25, 25, 25).text(texto, M, y);
        y += 2.5;
    };

    // ── Lo pendiente ──
    const pendientes = documentos.filter(d => d.saldo > 0.005)
        .sort((a, b) => String(a.vence || "").localeCompare(String(b.vence || "")));
    titulo(pendientes.length ? (esProveedor ? "Documentos por pagar" : "Documentos pendientes") : "Sin documentos pendientes");
    if (pendientes.length) {
        autoTable(pdf, {
            ...tabla,
            startY: y,
            head: [["DOCUMENTO", "FECHA", "VENCE", "ATRASO", { content: "TOTAL", styles: { halign: "right" } }, { content: "ABONADO", styles: { halign: "right" } }, { content: "SALDO", styles: { halign: "right" } }]],
            body: pendientes.map(d => [
                d.documento, fechaVE(d.fecha), fechaCorta(d.vence),
                d.dias_vencida > 0 ? `${d.dias_vencida} ${d.dias_vencida === 1 ? "día" : "días"}` : "—",
                monto(d.cargo, simbolo), monto(d.abonado, simbolo), monto(d.saldo, simbolo),
            ]),
            foot: [[{ content: "TOTAL PENDIENTE", colSpan: 6, styles: { halign: "right" } }, { content: monto(resumen.saldo_pendiente, simbolo), styles: { halign: "right" } }]],
            footStyles: { fontStyle: "bold", fontSize: 9, textColor: [25, 25, 25], fillColor: [246, 246, 246] },
            columnStyles: { 3: { textColor: [200, 30, 30] }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } },
            didParseCell: (c) => { if (c.section === "body" && c.column.index === 3 && c.cell.raw === "—") c.cell.styles.textColor = [150, 150, 150]; },
        });
        y = pdf.lastAutoTable.finalY + 9;
    } else {
        y += 6;
    }

    // ── Movimientos recientes: cada documento con sus abonos ──
    const desde = Date.now() - DIAS_HISTORIAL * 864e5;
    const recientes = documentos.filter(d => new Date(d.fecha).getTime() >= desde || d.movimientos.some(m => new Date(m.fecha).getTime() >= desde));
    if (recientes.length) {
        titulo(`Movimientos de los últimos ${DIAS_HISTORIAL} días`);
        const body = [];
        for (const d of recientes) {
            body.push([fechaVE(d.fecha), d.documento, d.concepto, monto(d.cargo, simbolo), "", { content: monto(d.saldo, simbolo), doc: true }]);
            for (const m of d.movimientos) {
                body.push([fechaVE(m.fecha), "", `${m.concepto}${m.referencia ? ` · Ref. ${m.referencia}` : ""}`, "", monto(m.monto, simbolo), ""]);
            }
        }
        autoTable(pdf, {
            ...tabla,
            startY: y,
            head: [["FECHA", "DOCUMENTO", "CONCEPTO", { content: "CARGO", styles: { halign: "right" } }, { content: "ABONO", styles: { halign: "right" } }, { content: "SALDO DOC.", styles: { halign: "right" } }]],
            body,
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 24 }, 3: { halign: "right", cellWidth: 24 }, 4: { halign: "right", cellWidth: 24 }, 5: { halign: "right", cellWidth: 24 } },
            didParseCell: (c) => {
                if (c.section !== "body") return;
                const esDoc = c.row.raw?.[5]?.doc;
                if (esDoc) { c.cell.styles.fontStyle = c.column.index === 1 ? "bold" : "normal"; c.cell.styles.fillColor = [250, 250, 250]; }
                else c.cell.styles.textColor = [95, 95, 95];
            },
        });
    }

    // ── Pie en cada hoja ──
    const total = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(140, 140, 140);
        pdf.text(`Estado de cuenta de ${contacto.nombre} al ${fechaVE(new Date())} · montos en ${simbolo}`, M, ALTO - 8);
        pdf.text(`Página ${i} de ${total}`, ANCHO - M, ALTO - 8, { align: "right" });
    }
    return pdf.output("blob");
}
