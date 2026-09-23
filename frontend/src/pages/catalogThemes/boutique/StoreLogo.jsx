import { useEffect, useState } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../../helpers";

// Logo de la tienda, preparado para la vitrina.
//
// Los comercios suben lo que tienen a mano, y casi siempre es un JPG con fondo blanco y mucho
// aire alrededor. Eso da dos problemas: el aire hace que el logo se vea diminuto por más alto
// que sea su caja, y en modo oscuro el fondo blanco queda como un rectángulo pegado a la
// cabecera. Pedirle al comercio un PNG transparente tampoco basta: sus letras negras
// desaparecen sobre el fondo oscuro.
//
// Así que la imagen se procesa aquí, una vez por URL:
//   - se quita el fondo claro que toca los bordes (relleno desde el borde, para no comerse
//     los blancos que forman parte del dibujo),
//   - se recorta al contenido,
//   - y para el modo oscuro se genera una segunda versión con los tonos neutros oscuros
//     aclarados (el negro pasa a blanco); los colores de marca no se tocan.
// Si el logo tiene un fondo de color, o el servidor de imágenes no permite leer sus píxeles,
// se muestra el original tal cual.

const cache = new Map();

const MAX_LADO = 1200;
// Blanco de fondo: desde FONDO_MIN el píxel se va del todo; entre BORDE_MIN y FONDO_MIN es el
// antialias del contorno y queda semitransparente.
const FONDO_MIN = 245;
const BORDE_MIN = 200;

function procesar(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                resolve(variantes(img));
            } catch {
                // Lienzo contaminado (sin CORS) o cualquier otra cosa: el original sirve.
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        // Con otra URL que la del <img> visible: si el navegador reusara esa respuesta de su
        // caché, que se pidió sin CORS, el lienzo quedaría contaminado.
        img.src = src + (src.includes("?") ? "&" : "?") + "logo=1";
    });
}

function variantes(img) {
    const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const datos = ctx.getImageData(0, 0, w, h);
    const px = datos.data;

    const esquinas = [0, w - 1, (h - 1) * w, h * w - 1].map((i) => i * 4);
    const transparente = esquinas.every((i) => px[i + 3] < 16);
    const blanco = esquinas.every((i) => px[i + 3] > 240 && Math.min(px[i], px[i + 1], px[i + 2]) >= FONDO_MIN);
    if (!transparente && !blanco) return null;

    if (blanco) {
        // Relleno desde el borde: solo es fondo el claro conectado con el exterior.
        const visto = new Uint8Array(w * h);
        const pila = [];
        for (let x = 0; x < w; x++) pila.push(x, (h - 1) * w + x);
        for (let y = 0; y < h; y++) pila.push(y * w, y * w + w - 1);
        while (pila.length) {
            const p = pila.pop();
            if (visto[p]) continue;
            visto[p] = 1;
            const i = p * 4;
            const claro = Math.min(px[i], px[i + 1], px[i + 2]);
            if (claro < BORDE_MIN) continue;
            px[i + 3] = claro >= FONDO_MIN ? 0
                : Math.round(px[i + 3] * (FONDO_MIN - claro) / (FONDO_MIN - BORDE_MIN));
            const x = p % w;
            if (x > 0) pila.push(p - 1);
            if (x < w - 1) pila.push(p + 1);
            if (p >= w) pila.push(p - w);
            if (p < w * (h - 1)) pila.push(p + w);
        }
    }

    // Recorte al contenido, con un margen mínimo para que el antialias no quede cortado.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 12) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return null;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;

    const exportar = (pixeles) => {
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out.getContext("2d").putImageData(new ImageData(pixeles, w, h), -x0, -y0, x0, y0, cw, ch);
        return out.toDataURL("image/png");
    };

    const claro = exportar(new Uint8ClampedArray(px));

    // Versión oscura: los neutros oscuros se reflejan (negro → blanco, gris 80 → 175). Por
    // debajo de 128 la curva es 255 − l y por encima la identidad, así que no hay salto. Los
    // píxeles con color (poca diferencia entre canales = neutro) quedan como están.
    const osc = new Uint8ClampedArray(px);
    for (let i = 0; i < osc.length; i += 4) {
        if (osc[i + 3] === 0) continue;
        const mx = Math.max(osc[i], osc[i + 1], osc[i + 2]);
        const mn = Math.min(osc[i], osc[i + 1], osc[i + 2]);
        if (mx - mn > 40 || mx >= 128) continue;
        const d = 255 - 2 * mx;
        osc[i] += d; osc[i + 1] += d; osc[i + 2] += d;
    }

    return { claro, oscuro: exportar(osc) };
}

export default function StoreLogo({ store, className = "" }) {
    const src = resolveImageUrl(store?.logo_url);
    // La caché guarda la promesa mientras se procesa y el resultado cuando termina.
    const [v, setV] = useState(() => {
        const c = src && cache.get(src);
        return c && !(c instanceof Promise) ? c : null;
    });

    useEffect(() => {
        if (!src) return;
        let vivo = true;
        if (!cache.has(src)) cache.set(src, procesar(src));
        Promise.resolve(cache.get(src)).then((r) => {
            cache.set(src, r);
            if (vivo) setV(r);
        });
        return () => { vivo = false; };
    }, [src]);

    if (!src) return null;

    // Las dos versiones van montadas y el tema elige con CSS: así el logo cambia al instante
    // con el botón de modo oscuro, sin que cada lugar donde se usa tenga que saber el tema.
    if (v?.claro) {
        return (
            <>
                <img src={v.claro} alt={store.name} className={`${className} object-contain dark:hidden`} />
                <img src={v.oscuro} alt="" aria-hidden="true" className={`${className} object-contain hidden dark:block`} />
            </>
        );
    }
    return <img src={src} alt={store.name} onError={imgRetryOnError} className={`${className} object-contain`} />;
}
