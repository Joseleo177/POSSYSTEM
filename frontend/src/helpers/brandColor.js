// Color de marca configurable por empresa.
//
// La escala `brand` de Tailwind (brand-50 … brand-900) está declarada como variables CSS
// —igual que content-muted/subtle en index.css— así que cambiar el color del sistema es
// reescribir diez variables en :root. Ninguno de los 94 archivos que usan clases brand-*
// necesita tocarse.
//
// Del color que elige la empresa solo se conservan el tono y la saturación; la luminosidad
// la impone LIGHTNESS_MAP. Es lo que evita que un amarillo claro deje ilegible el texto
// blanco de los botones: brand-500 siempre cae en 40% de luminosidad, sea cual sea el tono.

export const DEFAULT_BRAND = "#14b8a6"; // teal-500, el verde histórico del sistema

// Luminosidad por escalón, medida sobre la escala teal original de Tailwind para que una
// marca nueva mantenga el mismo ritmo de claros y oscuros que tenía el verde.
const LIGHTNESS_MAP = {
    50: 97, 100: 90, 200: 80, 300: 68, 400: 51,
    500: 40, 600: 32, 700: 26, 800: 21, 900: 18,
};

// #abc y #aabbcc, con o sin almohadilla. Devuelve null si no es un hex válido: quien llame
// decide el reemplazo (siempre DEFAULT_BRAND), en vez de recibir un color a medio parsear.
export function hexToHsl(hex) {
    const clean = String(hex || "").trim().replace(/^#/, "");
    const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;

    if (d === 0) return { h: 0, s: 0, l: l * 100 };

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;

    return { h: h * 360, s: s * 100, l: l * 100 };
}

// Devuelve "R G B" con los componentes separados por espacio: es el formato que espera
// rgb(var(--c-brand-500) / <alpha-value>), del que dependen las clases con opacidad como
// shadow-brand-500/20 o ring-brand-400/50.
function hslToRgbString(h, s, l) {
    const sn = s / 100;
    const ln = l / 100;
    const k = n => (n + h / 30) % 12;
    const a = sn * Math.min(ln, 1 - ln);
    const f = n => {
        const v = ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(255 * v);
    };
    return `${f(0)} ${f(8)} ${f(4)}`;
}

// Luminancia relativa WCAG. Hace falta porque la luminosidad de HSL no es el brillo que
// percibe el ojo: un amarillo y un azul al mismo 40% de HSL se ven radicalmente distintos,
// y solo el amarillo deja ilegible el texto blanco encima.
function luminance(rgbString) {
    const [r, g, b] = rgbString.split(" ").map(n => {
        const c = Number(n) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastWithWhite = rgbString => 1.05 / (luminance(rgbString) + 0.05);

// Piso de contraste para brand-500, que es el fondo de .btn-primary con texto blanco.
//
// El valor sale del propio teal por defecto (2.28:1), no del mínimo AA de 4.5:1. Exigir AA
// obligaría a oscurecer el verde actual a un petróleo apagado, y cambiar el aspecto del
// sistema no es parte de hacer el color configurable. Lo que sí garantiza este piso es que
// ninguna marca elegida quede *peor* que el verde de hoy: un amarillo puro, que en su tono
// natural cae a 1.3:1, se oscurece hasta igualarlo.
//
// Si algún día se quiere cumplir AA, el cambio es subir esta constante a 4.5 — pero afecta
// también al color por defecto y hay que revisar la interfaz entera.
const MIN_CONTRAST = 2.2;

// { 50: "240 253 250", 100: "...", … } listo para volcar en las variables CSS.
export function buildBrandScale(hex) {
    const hsl = hexToHsl(hex) || hexToHsl(DEFAULT_BRAND);
    // Un color casi gris se deja como está (alguien puede querer una marca neutra), pero
    // uno saturado se acota: por encima de 95% los tonos claros vibran y cansan la vista.
    const sat = hsl.s < 5 ? hsl.s : Math.min(hsl.s, 95);

    // Cuánto hay que oscurecer para que brand-500 sostenga texto blanco. Con tonos fríos
    // sale 0 y la escala queda tal cual; con amarillos y verdes lima puede pasar de 20
    // puntos de luminosidad. El mismo ajuste se aplica del 500 hacia abajo para que la
    // escala no pierda su progresión; los tonos claros (50-400) son fondos con texto
    // oscuro, así que no lo necesitan.
    let darken = 0;
    while (darken < 30 &&
           contrastWithWhite(hslToRgbString(hsl.h, sat, LIGHTNESS_MAP[500] - darken)) < MIN_CONTRAST) {
        darken += 1;
    }

    return Object.fromEntries(
        Object.entries(LIGHTNESS_MAP).map(([step, lightness]) => [
            step,
            hslToRgbString(hsl.h, sat, Number(step) >= 500 ? Math.max(4, lightness - darken) : lightness),
        ])
    );
}

// Escribe la escala en el <html>. Se llama al cargar los ajustes de la empresa y cada vez
// que se cambia el color en Configuración, para que la vista previa sea el sistema entero.
export function applyBrandColor(hex) {
    const scale = buildBrandScale(hex);
    const root = document.documentElement;
    Object.entries(scale).forEach(([step, rgb]) => {
        root.style.setProperty(`--c-brand-${step}`, rgb);
    });
}

// Quita las variables inline y devuelve el control a index.css, donde vive la escala teal
// original con sus valores exactos. Restaurar así —en vez de regenerar desde DEFAULT_BRAND—
// evita que "volver al verde de siempre" deje una escala parecida pero no idéntica: la
// derivación reproduce brand-500 al pie de la letra, pero los demás escalones quedan a un
// par de puntos porque Tailwind afina la saturación en cada uno.
export function clearBrandColor() {
    const root = document.documentElement;
    Object.keys(LIGHTNESS_MAP).forEach(step => {
        root.style.removeProperty(`--c-brand-${step}`);
    });
}

// El color viaja con los ajustes, que llegan por red. Guardarlo aquí permite pintarlo en el
// primer frame tras recargar y no mostrar el verde por defecto durante medio segundo.
const STORAGE_KEY = "pos-brand-color";

export function rememberBrandColor(hex) {
    try {
        if (hex) localStorage.setItem(STORAGE_KEY, hex);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {}
}

export function applyRememberedBrandColor() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) applyBrandColor(saved);
    } catch {}
}