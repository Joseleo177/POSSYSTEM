import { printHtml, esPantallaTactil, abrirParaGuardar } from "./printDocument";
import { resolveImageUrl } from "./image";

// Catálogo de productos en PDF para mayoristas (10-11-2026).
//
// Una tienda de cosméticos pidió su lista de productos "con este estilo tal cual": el de los
// catálogos impresos de las marcas de cuidado capilar. Hoja apaisada, un color por línea,
// y por producto dos páginas: la de presentación (foto grande, sellos redondos, frase en
// versalitas, nombre, "Ideal para", contenido y el precio en una caja de color) y la de ficha
// (descripción, ingredientes principales y el recuadro MODO DE USO). Delante de cada línea va
// su portadilla, y al final una lista de precios para pedir rápido.
//
// Nada de la marca de nadie: el logo, el eslogan y los colores son los de la tienda (Ajustes
// y el color de cada categoría). Si una categoría no tiene color, se reparte la paleta de
// abajo para que dos líneas seguidas no salgan iguales.
//
// El documento se imprime con printHtml y se guarda como PDF desde el diálogo del navegador
// ("Guardar como PDF"), igual que las facturas carta.

// Tonos de respaldo para las líneas sin color: los de los catálogos de cosmética (lila,
// rosa, durazno, menta, arena, celeste), todos con tinta suficiente para el texto blanco.
const PALETA = ["#9B6BC4", "#E0569A", "#C8784A", "#2A9D93", "#8C6A4F", "#3B8FD0", "#C0477C", "#6E7D3A"];

// ── Color ─────────────────────────────────────────────────────────────────────────────
const hexARgb = (hex) => {
    let h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const rgbAHex = (rgb) => "#" + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const luminancia = (rgb) => {
    const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};
// Oscurece hasta que el color se lea sobre `fondo` con el contraste pedido. Un color de
// categoría pastel (#F9A8D4) sirve de fondo, pero escrito encima de sí mismo no se ve.
const legibleSobre = (rgb, fondo, minimo) => {
    let c = rgb;
    for (let i = 0; i < 20 && contraste(c, fondo) < minimo; i++) c = mezclar(c, [20, 14, 24], 0.12);
    return c;
};

// Los cinco tonos de una línea a partir de su color.
export function tema(hex, i = 0) {
    const base = hexARgb(hex) || hexARgb(PALETA[i % PALETA.length]);
    const blanco = [255, 255, 255];
    const fondo = mezclar(base, blanco, 0.80);
    const fondoClaro = mezclar(base, blanco, 0.90);
    const piso = mezclar(base, blanco, 0.70);
    const acento = legibleSobre(base, blanco, 3.2);        // cajas con texto blanco
    const tinta = legibleSobre(base, fondo, 4.2);          // títulos sobre el fondo
    const texto = legibleSobre(mezclar(tinta, [60, 60, 66], 0.55), fondo, 7);
    return {
        fondo: rgbAHex(fondo), fondoClaro: rgbAHex(fondoClaro), piso: rgbAHex(piso),
        acento: rgbAHex(acento), tinta: rgbAHex(tinta), texto: rgbAHex(texto),
    };
}

// ── Texto ─────────────────────────────────────────────────────────────────────────────
export const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const parrafos = (s) => String(s || "").split(/\n\s*\n|\r\n\s*\r\n/).map(p => p.trim()).filter(Boolean);
export const conSaltos = (s) => esc(s).replace(/\r?\n/g, "<br>");

// La descripción es un solo campo de texto. Lo que la tienda escribe como "Ideal para: …",
// "Ingredientes: …" o "Modo de uso: …" se separa en su recuadro; el resto es la descripción.
// Las etiquetas se reconocen al inicio de un renglón o tras un punto, que es como aparecen
// en las fichas que ya están cargadas ("…sedoso desde el primer uso. Ideal para: cabellos…").
const ETIQUETAS = [
    ["ideal", /ideal para/],
    ["ingredientes", /ingredientes(?: principales| activos)?|componentes/],
    ["uso", /modo de (?:uso|empleo)|c[oó]mo (?:se )?usa(?:rlo)?|instrucciones(?: de uso)?|aplicaci[oó]n/],
    ["precaucion", /precauci[oó]n(?:es)?|advertencias?/],
    ["nota", /notas?/],
];
const RE_ETIQUETA = new RegExp(
    `(^|\\n|[.!?]\\s+)(${ETIQUETAS.map(([, r]) => r.source).join("|")})\\s*:\\s*`, "gi");

export function partirDescripcion(texto) {
    const s = String(texto || "").replace(/\r\n/g, "\n").trim();
    const out = { cuerpo: "", ideal: "", ingredientes: "", uso: "", precaucion: "", nota: "" };
    if (!s) return out;
    const marcas = [];
    let m;
    RE_ETIQUETA.lastIndex = 0;
    while ((m = RE_ETIQUETA.exec(s))) {
        const etiqueta = m[2].toLowerCase();
        const clave = ETIQUETAS.find(([, r]) => new RegExp(`^(?:${r.source})$`, "i").test(etiqueta))?.[0];
        if (!clave) continue;
        marcas.push({ clave, desde: m.index + m[1].length, texto: m.index + m[0].length });
    }
    let cuerpo = s.slice(0, marcas[0]?.desde ?? s.length);
    marcas.forEach((mk, i) => {
        let trozo = s.slice(mk.texto, marcas[i + 1]?.desde ?? s.length).trim();
        // "Ideal para" es una frase: si sigue otro párrafo sin etiqueta, ese vuelve al cuerpo.
        if (mk.clave === "ideal") {
            const corte = trozo.search(/\n\s*\n/);
            if (corte > 0) { cuerpo += "\n\n" + trozo.slice(corte).trim(); trozo = trozo.slice(0, corte).trim(); }
        }
        out[mk.clave] = out[mk.clave] ? `${out[mk.clave]}\n${trozo}` : trozo;
    });
    out.cuerpo = cuerpo.trim();
    return out;
}

export const precioTxt = (n, simbolo) => `${simbolo} ${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;
export const absoluta = (url) => {
    const r = resolveImageUrl(url);
    if (!r) return null;
    try { return new URL(r, window.location.href).href; } catch { return r; }
};

// ── Sellos ────────────────────────────────────────────────────────────────────────────
// Los beneficios del producto ("Reduce el frizz", "Sin sal") como los sellos redondos de los
// catálogos: anillo de color con el texto en arco y un ícono al centro. El ícono se elige
// por palabras del beneficio; sin coincidencia, una estrella de brillo.
const ICONOS = [
    [/frizz|brillo|suav|sedos|liso|onda/i, '<path d="M8 6c3 3-3 6 0 9s-3 6 0 9M14 5c3 3-3 6 0 9s-3 6 0 9" transform="translate(-1 -3)"/>'],
    [/ca[ií]da|crec|ra[ií]z|fol[ií]c|fibra|fortal/i, '<path d="M12 21v-7"/><path d="M12 14c-3 0-5-2.2-5-5.2C7 6 9.2 3.5 12 3c2.8.5 5 3 5 5.8 0 3-2 5.2-5 5.2z"/><path d="M5 21h14"/>'],
    [/hipoal|dermat|piel|sensib/i, '<path d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3z"/><path d="m9.5 13.5 1.8 1.8 3.5-3.6"/>'],
    [/natural|vegan|org[aá]n|extract|planta|herbal|sin sal|sin sulf|sin parab|sin silic|libre/i, '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19 14 10"/>'],
    [/repar|nutri|hidrat|protec|tecnolog|p[eé]ptid|keratin|amino/i, '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="4.5" r="1.6"/><circle cx="12" cy="19.5" r="1.6"/><circle cx="5.5" cy="8.2" r="1.6"/><circle cx="18.5" cy="8.2" r="1.6"/><circle cx="5.5" cy="15.8" r="1.6"/><circle cx="18.5" cy="15.8" r="1.6"/>'],
    [/sol|uv|t[eé]rmic|calor/i, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    [/cruel|animal/i, '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>'],
];
const BRILLO = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5 13.2 11 15.5 12 13.2 13 12 15.5 10.8 13 8.5 12 10.8 11z"/>';

let selloN = 0;
function sello(nombre, color) {
    const id = `arco${++selloN}`;
    const texto = esc(String(nombre).toUpperCase().slice(0, 34));
    const icono = (ICONOS.find(([re]) => re.test(nombre)) || [null, BRILLO])[1];
    // Texto largo: letra más chica para que entre en el arco de arriba sin pisarse.
    const tam = texto.length > 22 ? 7.2 : texto.length > 14 ? 8.2 : 9.2;
    return `
    <svg class="sello" viewBox="0 0 100 100" aria-hidden="true">
      <!-- El arco nace abajo y da la vuelta: así el centro de arriba queda a la mitad del
           trazo y un texto largo se reparte a los dos lados sin cortarse al principio. -->
      <defs><path id="${id}" d="M 50 86 A 36 36 0 1 1 50 14 A 36 36 0 1 1 50 86"/></defs>
      <circle cx="50" cy="50" r="48" fill="${color}"/>
      <circle cx="50" cy="50" r="27" fill="#fff"/>
      <text font-family="Fredoka, 'Source Sans 3', sans-serif" font-weight="600" font-size="${tam}" fill="#fff" letter-spacing="${texto.length > 22 ? 0.2 : 0.6}">
        <textPath href="#${id}" startOffset="50%" text-anchor="middle">${texto}</textPath>
      </text>
      <g transform="translate(35 35) scale(1.25)" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icono}</g>
    </svg>`;
}

// ── Piezas comunes ────────────────────────────────────────────────────────────────────
// Eslogan de la tienda al pie, con la primera palabra en negrita, como el "Famosos por los
// resultados" de los catálogos de referencia. Sin eslogan no se pone nada.
function eslogan(store, color) {
    const s = String(store.slogan || "").trim();
    if (!s) return "";
    const [primera, ...resto] = s.split(/\s+/);
    return `<div class="eslogan" style="color:${color}"><b>${esc(primera)}</b> ${esc(resto.join(" "))}</div>`;
}
const marca = (store) => store.logo_url
    ? `<div class="marca"><img src="${esc(absoluta(store.logo_url))}" alt=""></div>`
    : "";

// ── Páginas ───────────────────────────────────────────────────────────────────────────
function portada({ store, productos, t, opciones }) {
    const fotos = productos.filter(p => p.image_url).slice(0, 7);
    const titulo = opciones.titulo || "Catálogo de productos";
    // "Catálogo de productos" → las palabras largas en negrita, las cortas finas.
    const tituloHtml = esc(titulo).split(/\s+/).map(w => w.length <= 3 ? `<span class="fino">${w}</span>` : w).join(" ");
    return `
    <section class="pg portada" style="background:radial-gradient(ellipse at 50% 30%, ${t.fondoClaro} 0%, ${t.fondo} 70%)">
      <div class="portada-cab">
        ${store.logo_url ? `<img class="portada-logo" src="${esc(absoluta(store.logo_url))}" alt="">`
                         : `<div class="portada-nombre" style="color:${t.tinta}">${esc(store.name || "")}</div>`}
        <h1 style="color:${t.tinta}">${tituloHtml}</h1>
        <div class="portada-sub" style="color:${t.texto}">
          ${opciones.modoPrecio === "detal" ? "" : `<span class="chip" style="background:${t.acento}">Precios al mayor</span>`}
          <span>${esc(opciones.fecha)}</span>
        </div>
      </div>
      <div class="piso" style="background:${t.piso}"></div>
      <div class="vitrina">
        ${fotos.map((p, i) => `<img src="${esc(absoluta(p.image_url))}" alt="" style="--i:${i - (fotos.length - 1) / 2}">`).join("")}
      </div>
      ${opciones.condiciones ? `<div class="condiciones" style="color:${t.texto}">${conSaltos(opciones.condiciones)}</div>` : ""}
    </section>`;
}

function portadilla({ linea, productos, t, store }) {
    const fotos = linea.image_url ? [] : productos.filter(p => p.image_url).slice(0, 3);
    return `
    <section class="pg linea" style="background:radial-gradient(ellipse at 70% 40%, ${t.fondoClaro} 0%, ${t.fondo} 75%)">
      ${marca(store)}
      <div class="linea-txt">
        <div class="linea-pre" style="color:${t.acento}">Línea</div>
        <h2 style="color:#fff;text-shadow:0 2px 0 ${t.acento}, 0 6px 18px ${t.acento}66">${esc(linea.name)}</h2>
        <div class="regla" style="background:${t.acento}"></div>
        ${linea.description ? `<p style="color:${t.texto}">${esc(linea.description)}</p><div class="regla" style="background:${t.acento}"></div>` : ""}
        <div class="linea-cuenta" style="color:${t.texto}">${productos.length} ${productos.length === 1 ? "producto" : "productos"}</div>
      </div>
      <div class="linea-foto">
        ${linea.image_url
            ? `<img class="unica" src="${esc(absoluta(linea.image_url))}" alt="">`
            : fotos.map((p, i) => `<img class="trio" style="--i:${i}" src="${esc(absoluta(p.image_url))}" alt="">`).join("")}
      </div>
      ${eslogan(store, t.tinta)}
    </section>`;
}

function presentacion({ p, d, t, store, opciones }) {
    const mayor = p.precio_mayor;
    const ideal = d.ideal || (d.cuerpo ? (d.cuerpo.match(/^[^.!?\n]+[.!?]?/) || [""])[0] : "");
    const sellos = (p.benefits || []).slice(0, 4);
    return `
    <section class="pg prod" style="background:radial-gradient(ellipse at 28% 45%, ${t.fondoClaro} 0%, ${t.fondo} 70%)">
      ${marca(store)}
      <div class="prod-foto">
        ${p.image_url ? `<img src="${esc(absoluta(p.image_url))}" alt="">` : `<div class="sin-foto" style="color:${t.tinta}">${esc((p.name || "?").charAt(0))}</div>`}
      </div>
      <div class="prod-info">
        ${sellos.length ? `<div class="sellos">${sellos.map(s => sello(s, t.acento)).join("")}</div>` : ""}
        ${p.tagline ? `<div class="frase">${esc(p.tagline)}</div>` : ""}
        <h3 style="color:${t.tinta}">${esc(p.name)}</h3>
        <div class="regla" style="background:${t.acento}"></div>
        ${ideal ? `<p class="ideal" style="color:${t.texto}">${d.ideal ? `<b style="color:${t.acento}">Ideal para:</b> ` : ""}${esc(ideal)}</p><div class="regla" style="background:${t.acento}"></div>` : ""}
        ${p.net_content ? `<div class="contenido" style="color:${t.texto}">${esc(p.net_content)}</div>` : ""}
        <div class="precio-rot" style="color:${t.texto}">Precio</div>
        <div class="precio-fila">
          <span class="precio" style="background:${t.acento}">${esc(precioTxt(mayor, opciones.simbolo))}</span>
          ${opciones.mostrarDetal && opciones.modoPrecio !== "detal" && p.price > mayor + 0.004 ? `<span class="detal" style="color:${t.texto}">PVP sugerido<br><b>${esc(precioTxt(p.price, opciones.simbolo))}</b></span>` : ""}
        </div>
        ${p.brand ? `<div class="marca-txt" style="color:${t.texto}">${esc(p.brand)}</div>` : ""}
      </div>
      ${eslogan(store, t.tinta)}
    </section>`;
}

const tieneFicha = (d) => !!(d.cuerpo || d.ingredientes || d.uso || d.precaucion || d.nota);

function ficha({ p, d, t, store }) {
    const foto = p.detail_image_url || p.image_url;
    const extra = [["Precaución", d.precaucion], ["Nota", d.nota]].filter(([, v]) => v);
    return `
    <section class="pg ficha" style="background:${t.fondo}">
      ${marca(store)}
      <div class="ficha-txt">
        <h3 style="color:${t.tinta}">${esc(p.name)}</h3>
        <div class="regla" style="background:${t.acento}"></div>
        ${parrafos(d.cuerpo).map(x => `<p style="color:${t.texto}">${conSaltos(x)}</p>`).join("")}
        ${d.ingredientes ? `<div class="regla" style="background:${t.acento}"></div>
          <div class="rot" style="color:${t.acento}">Ingredientes principales:</div>
          <p style="color:${t.texto}">${conSaltos(d.ingredientes)}</p>` : ""}
        ${d.uso ? `<div class="caja-uso" style="background:${t.acento}">Modo de uso</div>
          <p style="color:${t.texto}">${conSaltos(d.uso)}</p>` : ""}
        ${extra.map(([k, v]) => `<p style="color:${t.texto}"><b style="color:${t.acento}">${k}:</b> ${conSaltos(v)}</p>`).join("")}
      </div>
      <div class="ficha-foto">${foto ? `<img src="${esc(absoluta(foto))}" alt="">` : ""}</div>
      ${eslogan(store, t.tinta)}
    </section>`;
}

// Lista de precios al cierre: lo que un mayorista mira para armar el pedido sin pasar las
// páginas. Dos columnas por hoja, agrupada por línea.
function listaPrecios({ grupos, store, opciones, t }) {
    const filas = [];
    for (const g of grupos) {
        filas.push({ tipo: "linea", g });
        for (const p of g.productos) filas.push({ tipo: "prod", p, g });
    }
    const POR_COLUMNA = 24;
    const hojas = [];
    for (let i = 0; i < filas.length; i += POR_COLUMNA * 2) hojas.push(filas.slice(i, i + POR_COLUMNA * 2));
    const fila = (f) => f.tipo === "linea"
        ? `<div class="lp-linea" style="color:${f.g.t.tinta};border-color:${f.g.t.acento}">${esc(f.g.linea.name)}</div>`
        : `<div class="lp-fila"><span class="lp-nom">${esc(f.p.name)}${f.p.net_content ? ` <i>${esc(f.p.net_content)}</i>` : ""}</span>
             ${opciones.mostrarDetal && opciones.modoPrecio !== "detal" ? `<span class="lp-detal">${esc(precioTxt(f.p.price, opciones.simbolo))}</span>` : ""}
             <span class="lp-precio" style="color:${f.g.t.tinta}">${esc(precioTxt(f.p.precio_mayor, opciones.simbolo))}</span></div>`;
    return hojas.map((h, n) => `
    <section class="pg lista" style="background:${t.fondoClaro}">
      ${marca(store)}
      <h2 style="color:${t.tinta}">Lista de precios${hojas.length > 1 ? ` <span class="fino">${n + 1}/${hojas.length}</span>` : ""}</h2>
      <div class="lp-cols">
        <div>${h.slice(0, POR_COLUMNA).map(fila).join("")}</div>
        <div>${h.slice(POR_COLUMNA).map(fila).join("")}</div>
      </div>
    </section>`).join("");
}

function contraportada({ store, t, opciones }) {
    const datos = [
        store.whatsapp && `WhatsApp +${store.whatsapp}`,
        store.phone && `Teléfono ${store.phone}`,
        store.instagram && `Instagram ${store.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/$/, "")}`,
        store.address,
        store.rif && `RIF ${store.rif}`,
    ].filter(Boolean);
    return `
    <section class="pg cierre" style="background:radial-gradient(ellipse at 50% 40%, ${t.fondoClaro} 0%, ${t.fondo} 75%)">
      ${store.logo_url ? `<img class="cierre-logo" src="${esc(absoluta(store.logo_url))}" alt="">`
                       : `<div class="portada-nombre" style="color:${t.tinta}">${esc(store.name || "")}</div>`}
      ${opciones.condiciones ? `<div class="cierre-cond" style="color:${t.texto}">${conSaltos(opciones.condiciones)}</div>` : ""}
      ${datos.length ? `<div class="cierre-datos" style="color:${t.texto}">${datos.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
      ${eslogan(store, t.tinta)}
    </section>`;
}

// ── Estilos ───────────────────────────────────────────────────────────────────────────
// Hoja A4 apaisada sin márgenes de impresora: cada <section> es una página completa y el
// color de fondo llega al borde. Fredoka (redondeada) para los títulos y Source Sans 3 para
// el texto, las dos de Google Fonts.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Source+Sans+3:wght@300;400;600;700&display=swap');
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font-family: 'Source Sans 3', 'Segoe UI', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pg { width: 297mm; height: 210mm; position: relative; overflow: hidden; break-after: page; page-break-after: always; }
.pg:last-child { break-after: auto; page-break-after: auto; }
.fino { font-weight: 400; }
.regla { width: 52mm; height: 0.7mm; border-radius: 1mm; margin: 4.5mm 0; }
.marca { position: absolute; top: 9mm; right: 11mm; width: 24mm; height: 24mm; border-radius: 50%; background: rgba(255,255,255,.55); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.marca img { max-width: 78%; max-height: 78%; object-fit: contain; }
.eslogan { position: absolute; right: 13mm; bottom: 10mm; font-size: 17pt; font-weight: 300; line-height: 1.05; max-width: 70mm; text-align: right; }
.eslogan b { font-weight: 700; }

/* Portada */
.portada-cab { position: absolute; top: 14mm; left: 0; right: 0; text-align: center; }
.portada-logo { max-height: 34mm; max-width: 120mm; object-fit: contain; }
.portada-nombre { font-family: Fredoka, sans-serif; font-size: 40pt; font-weight: 600; }
.portada h1 { font-family: 'Source Sans 3', sans-serif; font-weight: 700; font-size: 34pt; letter-spacing: -0.3pt; margin-top: 5mm; }
.portada-sub { margin-top: 4mm; display: flex; gap: 4mm; align-items: center; justify-content: center; font-size: 12pt; }
.chip { color: #fff; font-weight: 700; font-size: 10.5pt; letter-spacing: 1.6pt; text-transform: uppercase; padding: 1.6mm 4mm; }
.piso { position: absolute; left: 0; right: 0; bottom: 0; height: 52mm; }
.vitrina { position: absolute; left: 0; right: 0; bottom: 18mm; height: 98mm; display: flex; justify-content: center; align-items: flex-end; }
.vitrina img { height: calc(92mm - (var(--i) * var(--i)) * 4mm); max-width: 44mm; object-fit: contain; mix-blend-mode: multiply; margin: 0 -2mm; }
.condiciones { position: absolute; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 10.5pt; font-weight: 600; }

/* Portadilla de línea */
.linea-txt { position: absolute; left: 22mm; top: 40mm; width: 132mm; }
.linea-pre { font-size: 30pt; font-weight: 400; letter-spacing: 1pt; text-transform: uppercase; }
.linea h2 { font-family: Fredoka, sans-serif; font-weight: 700; font-size: 46pt; line-height: 1; text-transform: uppercase; letter-spacing: 0.5pt; margin-top: 1mm; }
.linea-txt p { font-size: 13.5pt; line-height: 1.4; font-weight: 400; }
.linea-cuenta { font-size: 11pt; font-weight: 600; letter-spacing: 1.4pt; text-transform: uppercase; }
.linea-foto { position: absolute; right: 12mm; top: 30mm; bottom: 26mm; width: 128mm; display: flex; align-items: flex-end; justify-content: center; }
.linea-foto .unica { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply; border-radius: 4mm; }
.linea-foto .trio { height: 120mm; max-width: 48mm; object-fit: contain; mix-blend-mode: multiply; margin: 0 -3mm; transform: translateY(calc(var(--i) * 0mm)); }
.linea-foto .trio:nth-child(2) { height: 140mm; max-width: 54mm; }

/* Presentación del producto */
.prod-foto { position: absolute; left: 10mm; top: 12mm; bottom: 12mm; width: 132mm; display: flex; align-items: center; justify-content: center; }
.prod-foto img { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply; border-radius: 4mm; }
.sin-foto { font-family: Fredoka, sans-serif; font-size: 120pt; font-weight: 600; opacity: .25; }
.prod-info { position: absolute; left: 150mm; right: 16mm; top: 20mm; bottom: 34mm; display: flex; flex-direction: column; justify-content: center; }
.sellos { display: flex; gap: 3.5mm; margin-bottom: 6mm; }
.sello { width: 25mm; height: 25mm; flex: none; }
.frase { font-size: 9.5pt; font-weight: 700; letter-spacing: 2.6pt; text-transform: uppercase; color: #555; line-height: 1.45; margin-bottom: 3mm; }
.prod h3, .ficha h3 { font-family: Fredoka, sans-serif; font-weight: 600; font-size: 27pt; line-height: 1.08; }
.ideal { font-size: 12.5pt; line-height: 1.38; }
.contenido { font-size: 11pt; font-weight: 300; margin: 1mm 0 1.5mm; }
.precio-rot { font-size: 8.5pt; font-weight: 700; letter-spacing: 1.8pt; text-transform: uppercase; margin-top: 2mm; margin-bottom: 1.2mm; }
.precio-fila { display: flex; align-items: center; gap: 5mm; }
.precio { color: #fff; font-weight: 700; font-size: 23pt; padding: 1.2mm 4mm; letter-spacing: -0.2pt; white-space: nowrap; }
.detal { font-size: 9.5pt; line-height: 1.25; }
.detal b { font-size: 12pt; }
.marca-txt { margin-top: 5mm; font-size: 9pt; letter-spacing: 1.6pt; text-transform: uppercase; font-weight: 600; opacity: .8; }

/* Ficha */
.ficha-txt { position: absolute; left: 20mm; top: 18mm; width: 168mm; bottom: 14mm; display: flex; flex-direction: column; justify-content: center; }
.ficha-txt p { font-size: 12.5pt; line-height: 1.42; margin-bottom: 2.2mm; font-weight: 400; }
.ficha .rot { font-size: 13pt; font-weight: 700; margin-bottom: 1mm; }
.caja-uso { align-self: flex-start; color: #fff; font-weight: 700; font-size: 14pt; letter-spacing: 1.4pt; text-transform: uppercase; padding: 1.4mm 4mm; margin: 4mm 0 3mm; }
.ficha-foto { position: absolute; right: 10mm; top: 26mm; bottom: 30mm; width: 86mm; display: flex; align-items: center; justify-content: center; }
.ficha-foto img { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply; border-radius: 4mm; }

/* Lista de precios */
.lista h2 { position: absolute; left: 18mm; top: 14mm; font-family: Fredoka, sans-serif; font-weight: 600; font-size: 22pt; }
.lp-cols { position: absolute; left: 18mm; right: 18mm; top: 32mm; bottom: 12mm; display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; }
.lp-linea { font-family: Fredoka, sans-serif; font-weight: 600; font-size: 11.5pt; border-bottom: 0.5mm solid; padding: 2.4mm 0 1mm; margin-bottom: 0.5mm; text-transform: uppercase; letter-spacing: .6pt; }
.lp-fila { display: flex; align-items: baseline; gap: 3mm; font-size: 10pt; padding: 1.15mm 0; border-bottom: 0.2mm solid rgba(0,0,0,.08); color: #333; }
.lp-nom { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-nom i { font-style: normal; color: #888; font-size: 9pt; }
.lp-detal { color: #888; font-size: 9pt; white-space: nowrap; }
.lp-precio { font-weight: 700; white-space: nowrap; min-width: 20mm; text-align: right; }

/* Contraportada */
.cierre { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8mm; }
.cierre-logo { max-height: 40mm; max-width: 130mm; object-fit: contain; }
.cierre-cond { font-size: 13pt; font-weight: 600; max-width: 170mm; line-height: 1.4; }
.cierre-datos { font-size: 12pt; line-height: 1.7; }
.cierre .eslogan { position: static; text-align: center; max-width: none; font-size: 20pt; }
`;

/**
 * Arma el HTML del catálogo. `datos` es la respuesta de GET /products/catalog-pdf.
 * opciones: { titulo, condiciones, descuento (% para los que no tienen precio al mayor),
 *             sinPrecio: "descuento" | "omitir", modoPrecio: "mayor" | "detal", mostrarDetal, fichas, lista, simbolo, fecha }
 * Con modoPrecio "detal" sale el precio de venta de siempre, sin tocar el precio al mayor.
 */
export function armarCatalogoHtml(datos, opciones) {
    selloN = 0;
    const store = datos.store || {};
    const desc = Math.max(0, Math.min(90, parseFloat(opciones.descuento) || 0));
    const productos = (datos.products || [])
        .map(p => ({
            ...p,
            // `precio_mayor` es "el precio que sale": el al mayor, o el detal si así se eligió.
            precio_mayor: opciones.modoPrecio === "detal" ? p.price
                : (p.wholesale_price != null ? p.wholesale_price : (p.price * (1 - desc / 100))),
            sin_mayor: opciones.modoPrecio !== "detal" && p.wholesale_price == null,
        }))
        .filter(p => !(opciones.sinPrecio === "omitir" && p.sin_mayor));

    const tGeneral = tema(store.color, 0);
    const grupos = [];
    (datos.lines || []).forEach((linea, i) => {
        const deLinea = productos.filter(p => (p.category_id ?? null) === (linea.id ?? null));
        if (deLinea.length) grupos.push({ linea, productos: deLinea, t: tema(linea.color, i) });
    });

    const paginas = [portada({ store, productos, t: tGeneral, opciones })];
    for (const g of grupos) {
        if (grupos.length > 1 || g.linea.id) paginas.push(portadilla({ linea: g.linea, productos: g.productos, t: g.t, store }));
        for (const p of g.productos) {
            const d = partirDescripcion(p.description);
            paginas.push(presentacion({ p, d, t: g.t, store, opciones }));
            if (opciones.fichas && tieneFicha(d)) paginas.push(ficha({ p, d, t: g.t, store }));
        }
    }
    if (opciones.lista && productos.length) paginas.push(listaPrecios({ grupos, store, opciones, t: tGeneral }));
    paginas.push(contraportada({ store, t: tGeneral, opciones }));

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(opciones.titulo || "Catálogo")} - ${esc(store.name || "")}</title>
<style>${CSS}</style></head><body>${paginas.join("")}</body></html>`;
}

// Cuántas páginas va a salir, para decirlo antes de imprimir.
export function contarPaginas(datos, opciones) {
    const html = armarCatalogoHtml(datos, opciones);
    return (html.match(/<section class="pg /g) || []).length;
}

export function imprimirCatalogo(datos, opciones) {
    // 1123 x 794 es la hoja A4 apaisada a 96 dpi: el lienzo donde se calcula el layout.
    // En el teléfono, pestaña aparte (ver abrirParaGuardar). Devuelve cómo se abrió.
    const html = armarCatalogoHtml(datos, opciones);
    if (esPantallaTactil() && abrirParaGuardar(html, { ancho: 1123 })) return "pestaña";
    printHtml(html, { width: 1123, height: 794 });
    return "dialogo";
}
