import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { useApp } from "../../context/AppContext";
import { encodeQr, qrSvgPath } from "../../helpers/qrcode";
import { printHtml } from "../../helpers/printDocument";
import { esc } from "../../helpers/printReportBase";

const BORDER = 4; // margen blanco que exige el estándar, en módulos

// En el teléfono el QR se manda por WhatsApp o redes: ahí "Compartir" abre la hoja del
// sistema, que además trae "Guardar imagen". En escritorio esa hoja estorba; se descarga.
const canShareFiles = () => {
    try {
        if (!window.matchMedia?.("(pointer: coarse)").matches) return false;
        return !!navigator.canShare?.({ files: [new File([""], "qr.png", { type: "image/png" })] });
    } catch { return false; }
};

// Achica la fuente hasta que el texto quepa en `max` px.
const fitFont = (ctx, text, weight, size, max) => {
    let s = size;
    do { ctx.font = `${weight} ${s}px Inter, system-ui, sans-serif`; } while (ctx.measureText(text).width > max && --s > 12);
};

// Imagen para compartir: nombre de la tienda, el QR, la invitación y el enlace escrito, por si
// quien la recibe no puede escanear (la está viendo en el mismo teléfono).
async function renderPng(qr, storeName, url) {
    await document.fonts?.ready;
    const W = 1080, PAD = 120;
    const scale = Math.floor((W - PAD * 2) / (qr.size + BORDER * 2));
    const qrPx = scale * (qr.size + BORDER * 2);
    const H = 150 + qrPx + 200;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";

    ctx.fillStyle = "#111827";
    fitFont(ctx, storeName, 700, 56, W - PAD * 2);
    ctx.fillText(storeName, W / 2, 120);

    const x0 = (W - qrPx) / 2, y0 = 150;
    for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
            if (qr.modules[y][x]) ctx.fillRect(x0 + (x + BORDER) * scale, y0 + (y + BORDER) * scale, scale, scale);
        }
    }

    ctx.fillStyle = "#374151";
    fitFont(ctx, "Escanea para ver nuestro catálogo", 600, 38, W - PAD * 2);
    ctx.fillText("Escanea para ver nuestro catálogo", W / 2, y0 + qrPx + 70);
    ctx.fillStyle = "#6b7280";
    fitFont(ctx, url, 500, 30, W - 80);
    ctx.fillText(url, W / 2, y0 + qrPx + 130);

    return new Promise(res => canvas.toBlob(res, "image/png"));
}

// Cartel en hoja carta para el mostrador o la vitrina. SVG y no la imagen: así sale nítido a
// cualquier tamaño de impresión.
function printPoster(qr, storeName, url) {
    const n = qr.size + BORDER * 2;
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Catálogo · ${esc(storeName)}</title>
    <style>
        @page { size: letter; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #111827; }
        .sheet { width: 8.5in; padding: 1.1in 0.9in 0; text-align: center; }
        .store { font-size: 30pt; font-weight: 700; letter-spacing: -0.02em; overflow-wrap: break-word; }
        svg { display: block; width: 5in; height: 5in; margin: 0.45in auto 0.35in; }
        .cta { font-size: 18pt; font-weight: 600; color: #374151; }
        .url { margin-top: 0.12in; font-size: 11pt; color: #6b7280; overflow-wrap: anywhere; }
    </style>
</head>
<body>
    <div class="sheet">
        <div class="store">${esc(storeName)}</div>
        <svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
            <path fill="#000" d="${qrSvgPath(qr, BORDER)}"/>
        </svg>
        <div class="cta">Escanea para ver nuestro catálogo</div>
        <div class="url">${esc(url)}</div>
    </div>
</body>
</html>`;
    printHtml(html);
}

export default function CatalogQrCard({ url, slug }) {
    const { notify, storeName } = useApp();
    const qr = useMemo(() => encodeQr(url), [url]);
    const share = useMemo(canShareFiles, []);
    const n = qr.size + BORDER * 2;

    // La imagen se arma de antemano: Safari solo abre la hoja de compartir pegada al toque, y
    // dibujar el lienzo en ese momento la hace fallar.
    const [file, setFile] = useState(null);
    useEffect(() => {
        let alive = true;
        setFile(null);
        renderPng(qr, storeName, url).then(blob => {
            if (alive && blob) setFile(new File([blob], `catalogo-${slug}.png`, { type: "image/png" }));
        });
        return () => { alive = false; };
    }, [qr, storeName, url, slug]);

    const exportImage = async () => {
        if (!file) return;
        if (!share) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            a.download = file.name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            return;
        }
        try {
            await navigator.share({ files: [file], title: storeName, text: url });
        } catch (e) {
            // Cerrar la hoja sin elegir nada no es un error.
            if (e?.name !== "AbortError") notify("No se pudo compartir la imagen", "err");
        }
    };

    return (
        <div className="rounded-xl border border-border dark:border-white/10 p-3 flex gap-3 items-center">
            {/* Fondo blanco también en modo oscuro: un QR invertido no lo leen todas las cámaras. */}
            <svg
                viewBox={`0 0 ${n} ${n}`}
                shapeRendering="crispEdges"
                className="w-[104px] h-[104px] shrink-0 rounded-lg bg-white border border-border/60 dark:border-transparent"
                role="img"
                aria-label={`Código QR de ${url}`}
            >
                <path fill="#000" d={qrSvgPath(qr, BORDER)} />
            </svg>
            <div className="min-w-0 flex-1 space-y-2">
                <div>
                    <div className="text-[12px] font-medium text-content-subtle">Código QR</div>
                    <p className="text-[12px] font-semibold text-content-muted leading-relaxed mt-1">
                        Para el mostrador, la vitrina o tus redes. Al escanearlo abre el catálogo.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={exportImage}
                        disabled={!file}
                        variant="ghost"
                        className="px-3"
                    >
                        {share ? "Compartir" : "Descargar"}
                    </Button>
                    <Button
                        onClick={() => printPoster(qr, storeName, url)}
                        variant="ghost"
                        className="px-3"
                    >
                        Imprimir
                    </Button>
                </div>
            </div>
        </div>
    );
}
