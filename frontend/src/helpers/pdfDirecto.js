import { tema, absoluta } from "./catalogPdf";

// PDF armado en el navegador, sin diálogo de impresión. Solo en el teléfono (11-11-2026).
//
// Historia: primero el teléfono abría una pestaña para imprimir. En el iPhone eso no servía a
// cualquier usuario: Chrome, Brave y la app instalada no imprimen, y Safari sí pero mete sus
// márgenes blancos y la hoja Carta/A4 vertical alrededor del catálogo. Con el PDF armado aquí el
// archivo sale tal cual el diseño, sin márgenes, y se entrega con Compartir (que en el iPhone
// ofrece "Guardar en Archivos" y WhatsApp con el archivo adjunto) o Descargar.
//
// Dos caminos:
//  - Catálogo con fotos: cada página se dibuja como imagen con html-to-image, que usa el motor
//    del propio navegador, así que sale idéntica (degradados, mezcla de fotos, sellos en arco).
//  - Lista de precios: PDF de verdad con jsPDF + autotable. Texto real, liviano y rápido.
//
// Las librerías se cargan solo al generar (import dinámico): no pesan en la carga de la app.

const esWebKit = () => {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
        || (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua));
};

const pausa = () => new Promise(r => setTimeout(r, 0));

// ── Fotos: se bajan una vez y se achican ───────────────────────────────────────────────
// html-to-image mete cada foto dentro de cada página; con las originales (1–3 MB) el armado
// era lento y el teléfono se quedaba sin memoria. Se pasan a JPEG de 1200 px sobre blanco: las
// fotos van con mezcla "multiply", así que el blanco desaparece igual que el fondo original.
// El logo se queda en PNG porque su transparencia sí se ve.
async function fotoReducida(url, { max = 1200, png = false } = {}) {
    try {
        const resp = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        const ctx = c.getContext("2d");
        if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        return c.toDataURL(png ? "image/png" : "image/jpeg", 0.86);
    } catch {
        return null;   // sin la foto la página sale igual; no vale tumbar el PDF entero
    }
}

// De a varias a la vez: todas juntas saturan la conexión del teléfono.
async function reducirTodas(urls, opciones, alAvanzar) {
    const res = new Map();
    const cola = [...new Set(urls.filter(Boolean))];
    let hechas = 0;
    const trabajador = async () => {
        while (cola.length) {
            const u = cola.shift();
            res.set(u, await fotoReducida(u, opciones(u)));
            alAvanzar?.(++hechas);
        }
    };
    await Promise.all(Array.from({ length: 5 }, trabajador));
    return res;
}

// ── CSS del catálogo dentro de la app ──────────────────────────────────────────────────
// Las páginas se montan fuera de la vista en el propio documento (html-to-image necesita los
// nodos ahí para leer sus estilos). Las reglas del catálogo se encierran bajo `.pdfgen` para que
// `*`, `body` o `h1` no toquen la app, y @page/@import se van.
function encerrarCss(css) {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/@import[^;]+;/g, "")
        .replace(/@page[^{]*\{[^}]*\}/g, "")
        .split("}")
        .map(trozo => {
            const i = trozo.indexOf("{");
            if (i < 0) return trozo;
            const sels = trozo.slice(0, i).split(",").map(s => s.trim()).filter(Boolean).map(s => {
                if (s === "html" || s === "body") return ".pdfgen";
                if (s === "*") return ".pdfgen, .pdfgen *";
                return `.pdfgen ${s}`;
            });
            return `${sels.join(", ")} {${trozo.slice(i + 1)}`;
        })
        .join("}");
}

// Las fuentes del catálogo, incrustadas como data: para que viajen dentro de cada página. Se
// hace a mano porque getFontEmbedCSS de html-to-image solo traía las de la app (3 MB, sin las
// del catálogo) y el PDF salía en Arial con los títulos encimados. Solo los juegos latino y
// latino extendido: con el cirílico, griego y vietnamita cada página cargaba varios MB.
const aDataUrl = (url) => fetch(url).then(r => r.blob()).then(b => new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = mal;
    fr.readAsDataURL(b);
}));

async function fuentesEmbebidas(hojas) {
    const archivos = new Map();
    let css = "";
    for (const href of hojas) {
        try {
            const texto = await (await fetch(href)).text();
            for (const regla of texto.match(/@font-face\s*\{[^}]*\}/g) || []) {
                const rango = (regla.match(/unicode-range:\s*([^;}]+)/i) || [])[1];
                if (rango && !/U\+0000-00FF|U\+0100-02/i.test(rango)) continue;
                const url = ((regla.match(/url\(([^)]+)\)/) || [])[1] || "").replace(/["']/g, "");
                if (!url) continue;
                // Una fuente variable sirve todos los pesos desde el mismo archivo: se baja una vez.
                if (!archivos.has(url)) archivos.set(url, aDataUrl(url).catch(() => null));
                const data = await archivos.get(url);
                if (data) css += regla.replace(/url\([^)]+\)/, `url(${data})`) + "\n";
            }
        } catch { /* sin conexión a Google Fonts sale con la fuente de respaldo */ }
    }
    return css;
}

// Las mismas fuentes cargadas en la página, para que el armado mida los textos con ellas.
async function cargarFuentes(urls) {
    for (const href of urls) {
        if (!document.querySelector(`link[data-pdfgen][href="${href}"]`)) {
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = href;
            l.crossOrigin = "anonymous";
            l.dataset.pdfgen = "";
            document.head.appendChild(l);
            await new Promise(ok => { l.onload = l.onerror = ok; });
        }
    }
    try {
        await Promise.all([
            "500 20px Fredoka", "600 20px Fredoka", "700 20px Fredoka",
            "300 20px 'Source Sans 3'", "400 20px 'Source Sans 3'", "600 20px 'Source Sans 3'", "700 20px 'Source Sans 3'",
        ].map(f => document.fonts.load(f)));
        await document.fonts.ready;
    } catch { /* sin fuentes de Google sale con la de respaldo */ }
}

/**
 * Catálogo con fotos → Blob PDF (A4 apaisado, sin márgenes). `html` es el de armarCatalogoHtml
 * en su versión apaisada. alAvanzar({ fase: "fotos" | "paginas", hecho, total }); debeParar().
 */
export async function catalogoAPdf(html, { logoUrl, alAvanzar, debeParar } = {}) {
    const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

    const doc = new DOMParser().parseFromString(html, "text/html");
    const cssCrudo = Array.from(doc.querySelectorAll("style")).map(s => s.textContent).join("\n");
    const fuentes = Array.from(cssCrudo.matchAll(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/g)).map(m => m[1]);

    // Fotos achicadas antes de montar.
    const imgs = Array.from(doc.querySelectorAll("img"));
    const logoAbs = logoUrl ? absoluta(logoUrl) : null;
    const urls = imgs.map(i => i.getAttribute("src"));
    const total = new Set(urls.filter(Boolean)).size;
    const reducidas = await reducirTodas(urls, (u) => (u === logoAbs ? { max: 600, png: true } : { max: 1200 }),
        (hecho) => alAvanzar?.({ fase: "fotos", hecho, total }));
    imgs.forEach(i => { const d = reducidas.get(i.getAttribute("src")); if (d) i.setAttribute("src", d); });
    if (debeParar?.()) return null;

    await cargarFuentes(fuentes);

    const host = document.createElement("div");
    host.className = "pdfgen";
    host.setAttribute("aria-hidden", "true");
    // Fuera de la vista pero con su tamaño real: html-to-image copia lo que el navegador pinta.
    host.style.cssText = "position:fixed;left:-20000px;top:0;width:1123px;pointer-events:none;";
    // `img{display:inline}`: la app pone las imágenes en bloque (preflight de Tailwind) y el logo
    // de la portada, que se centra como texto, quedaba pegado a la izquierda.
    host.innerHTML = `<style>.pdfgen{color:#222;background:#fff;}.pdfgen img{display:inline;max-width:none;}${encerrarCss(cssCrudo)}</style>${doc.body.innerHTML}`;
    document.body.appendChild(host);

    try {
        await Promise.all(Array.from(host.querySelectorAll("img")).map(i => (i.decode ? i.decode().catch(() => {}) : null)));
        const paginas = Array.from(host.querySelectorAll("section.pg"));
        const fontEmbedCSS = await fuentesEmbebidas(fuentes);
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
        const opciones = {
            width: 1123, height: 794,
            // En el teléfono 1,3: en esa pantalla no se nota y el armado tarda y pesa menos.
            pixelRatio: window.matchMedia("(pointer: coarse)").matches ? 1.3 : 1.6, quality: 0.84,
            backgroundColor: "#ffffff", fontEmbedCSS, cacheBust: false,
        };
        // Safari a veces pinta la primera pasada sin las fotos: se dibuja dos veces.
        const dosPasadas = esWebKit();
        for (let i = 0; i < paginas.length; i++) {
            if (debeParar?.()) return null;
            if (dosPasadas) await toJpeg(paginas[i], opciones).catch(() => null);
            const img = await toJpeg(paginas[i], opciones);
            if (i) pdf.addPage("a4", "landscape");
            pdf.addImage(img, "JPEG", 0, 0, 297, 210, undefined, "FAST");
            alAvanzar?.({ fase: "paginas", hecho: i + 1, total: paginas.length });
            await pausa();
        }
        return pdf.output("blob");
    } finally {
        host.remove();
    }
}

// ── Lista de precios: PDF con texto real ───────────────────────────────────────────────
const UNIDAD_CORTA = { UNIDAD: "und", KG: "kg", LITRO: "L", METRO: "m", M2: "m²" };
const hexRgb = (hex) => {
    const h = String(hex || "#000").replace("#", "");
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
};
const precio = (n, simbolo) => `${simbolo} ${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;
const enBs = (n) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lista de precios → Blob PDF. Mismas opciones que armarListaHtml. */
export async function listaAPdf(datos, opciones, { alAvanzar } = {}) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const store = datos.store || {};
    const col = opciones.columnas || {};
    const tasa = parseFloat(opciones.tasa) || 0;
    const conBs = col.bs && tasa > 0;
    const acento = hexRgb(tema(store.color, 0).acento);
    const productos = datos.products || [];

    // Logo y miniaturas, chicos: en la lista se ven a 8 mm.
    const logoAbs = store.logo_url ? absoluta(store.logo_url) : null;
    const urls = [logoAbs, ...(col.foto ? productos.map(p => p.image_url && absoluta(p.image_url)) : [])];
    const total = new Set(urls.filter(Boolean)).size;
    const fotos = await reducirTodas(urls, (u) => (u === logoAbs ? { max: 400, png: true } : { max: 120 }),
        (hecho) => alAvanzar?.({ fase: "fotos", hecho, total }));

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const M = 10, ANCHO = 210;

    // Cabecera de la primera hoja.
    let x = M;
    const logo = logoAbs ? fotos.get(logoAbs) : null;
    if (logo) {
        const p = pdf.getImageProperties(logo);
        const h = 16, w = Math.min(40, (p.width / p.height) * h);
        pdf.addImage(logo, "PNG", M, 11, w, h);
        x = M + w + 5;
    }
    pdf.setFont("helvetica", "bold").setFontSize(17).setTextColor(...acento);
    pdf.text(opciones.titulo || "Lista de precios", x, 17);
    pdf.setFontSize(10).setTextColor(34, 34, 34);
    pdf.text([store.name, opciones.sucursal].filter(Boolean).join(" · "), x, 22.5);
    const contacto = [store.whatsapp && `WhatsApp +${store.whatsapp}`, store.phone && `Tel. ${store.phone}`, store.rif && `RIF ${store.rif}`, store.address].filter(Boolean).join(" · ");
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(110, 110, 110);
    const lineasContacto = pdf.splitTextToSize(contacto, ANCHO - M - x - 38).slice(0, 2);
    pdf.text(lineasContacto, x, 27);
    pdf.setFontSize(8.5).setTextColor(85, 85, 85);
    const der = [opciones.fecha, `${productos.length} ${productos.length === 1 ? "producto" : "productos"}`, conBs && `Tasa ${enBs(tasa)} ${opciones.simboloLocal || "Bs."}`].filter(Boolean);
    der.forEach((t, i) => pdf.text(t, ANCHO - M, 15 + i * 4.2, { align: "right" }));
    let y = Math.max(31, 27 + lineasContacto.length * 3.6);
    pdf.setDrawColor(...acento).setLineWidth(0.6).line(M, y, ANCHO - M, y);
    y += 3;
    if (opciones.condiciones) {
        const cond = pdf.splitTextToSize(opciones.condiciones, ANCHO - 2 * M - 6);
        const h = cond.length * 3.8 + 3;
        pdf.setFillColor(...hexRgb(tema(store.color, 0).fondoClaro)).rect(M, y, ANCHO - 2 * M, h, "F");
        pdf.setFillColor(...acento).rect(M, y, 0.8, h, "F");
        pdf.setFontSize(8.5).setTextColor(68, 68, 68).text(cond, M + 3, y + 4.2);
        y += h + 3;
    }

    const columnas = [
        col.foto && { k: "foto", t: "", w: 10 },
        col.codigo && { k: "cod", t: "CÓDIGO" },
        { k: "nom", t: "PRODUCTO" },
        { k: "uni", t: "UND." },
        col.detal && { k: "detal", t: col.mayor ? "DETAL" : "PRECIO", num: true },
        col.mayor && { k: "mayor", t: col.detal ? "AL MAYOR" : "PRECIO", num: true },
        conBs && { k: "bs", t: (opciones.simboloLocal || "Bs.").toUpperCase(), num: true },
    ].filter(Boolean);
    // Lo que se pasa a Bs.: el detal si sale, si no el al mayor.
    const baseBs = (p) => (col.detal || !col.mayor ? p.price : p.wholesale_price);

    const lineas = (datos.lines || []).map((l, i) => ({ ...l, t: tema(l.color, i) }));
    const body = [];
    for (const l of lineas) {
        const prods = productos.filter(p => (p.category_id ?? null) === (l.id ?? null));
        if (!prods.length) continue;
        if (lineas.length > 1 || l.id) {
            body.push([{
                content: `${String(l.name).toUpperCase()}   ${prods.length}`, colSpan: columnas.length,
                styles: { fontStyle: "bold", fontSize: 9.5, textColor: hexRgb(l.t.tinta), fillColor: [255, 255, 255], cellPadding: { top: 3.5, bottom: 1.2, left: 1.5, right: 1.5 } },
                grupo: hexRgb(l.t.tinta),
            }]);
        }
        prods.forEach((p) => {
            const aBs = baseBs(p);
            const unidad = String(p.unit || "").toUpperCase();
            body.push(columnas.map(c => {
                switch (c.k) {
                    case "foto": return { content: "", foto: p.image_url ? fotos.get(absoluta(p.image_url)) : null };
                    case "cod": return p.barcode || "";
                    case "nom": return p.net_content ? `${p.name}  ${p.net_content}` : p.name;
                    case "uni": return UNIDAD_CORTA[unidad] || unidad.toLowerCase();
                    case "detal": return precio(p.price, opciones.simbolo);
                    case "mayor": return p.wholesale_price != null ? precio(p.wholesale_price, opciones.simbolo) : "—";
                    case "bs": return aBs != null ? enBs(aBs * tasa) : "—";
                    default: return "";
                }
            }));
        });
    }

    const estilosCol = {};
    columnas.forEach((c, i) => {
        estilosCol[i] = {
            ...(c.w ? { cellWidth: c.w } : {}),
            ...(c.num ? { halign: "right", fontStyle: c.k === "bs" ? "normal" : "bold" } : {}),
            ...(c.k === "cod" || c.k === "uni" ? { textColor: [120, 120, 120], fontSize: 8 } : {}),
            ...(c.k === "nom" ? { cellWidth: "auto" } : {}),
        };
    });

    autoTable(pdf, {
        startY: y,
        margin: { left: M, right: M, top: 12, bottom: 14 },
        head: [columnas.map(c => ({ content: c.t, styles: c.num ? { halign: "right" } : {} }))],
        body,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 8.6, cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 }, textColor: [34, 34, 34], valign: "middle", overflow: "linebreak" },
        headStyles: { fontSize: 7, fontStyle: "bold", textColor: [102, 102, 102], fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: [187, 187, 187] },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: [228, 228, 228], minCellHeight: col.foto ? 9.5 : 0 },
        columnStyles: estilosCol,
        showHead: "everyPage",
        didParseCell: (d) => {
            if (d.section === "body" && d.cell.raw?.grupo) {
                d.cell.styles.lineWidth = { bottom: 0.4 };
                d.cell.styles.lineColor = d.cell.raw.grupo;
            }
        },
        didDrawCell: (d) => {
            const f = d.section === "body" && d.cell.raw?.foto;
            if (f) pdf.addImage(f, "JPEG", d.cell.x + 1, d.cell.y + (d.cell.height - 8) / 2, 8, 8);
        },
        didDrawPage: () => {
            pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(136, 136, 136);
            pdf.text(`Página ${pdf.internal.getNumberOfPages()} de {total}`, ANCHO - M, 297 - 6, { align: "right" });
        },
    });
    if (typeof pdf.putTotalPages === "function") pdf.putTotalPages("{total}");
    return pdf.output("blob");
}

// ── Entregar el archivo ────────────────────────────────────────────────────────────────
export const nombreArchivo = (titulo, tienda) =>
    `${[titulo, tienda].filter(Boolean).join(" - ")}`.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 120) + ".pdf";

export function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

export function sePuedeCompartir(blob, nombre) {
    try {
        return !!navigator.canShare?.({ files: [new File([blob], nombre, { type: "application/pdf" })] });
    } catch { return false; }
}

export async function compartir(blob, nombre) {
    const file = new File([blob], nombre, { type: "application/pdf" });
    await navigator.share({ files: [file], title: nombre.replace(/\.pdf$/, "") });
}
