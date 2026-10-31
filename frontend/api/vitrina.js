// Cabecera HTML de la vitrina (/catalogo/<tienda> y /catalogo/<tienda>/p/<id>). Función de
// Vercel: la app es una sola página y WhatsApp, Facebook o Telegram no ejecutan JavaScript al
// armar la vista previa de un enlace, así que leían "NXUS ERP" para todas las tiendas. Aquí se
// toma el index.html publicado y se le escribe el título, la descripción, la foto (Open Graph)
// y los datos estructurados para Google (JSON-LD). La vitrina en sí carga igual que siempre.
//
// Vercel factura el tiempo de reloj: la respuesta queda en su CDN 5 minutos (s-maxage), así que
// un enlace muy compartido llama al backend una vez cada 5 minutos, no una vez por visita. Un
// despliegue nuevo vacía esa caché solo. Si el backend no responde a tiempo se entrega el
// index.html de siempre: la vitrina funciona, solo que sin vista previa.
//
// Pasados esos 5 minutos la página se sigue entregando AL INSTANTE desde la CDN durante un día
// (stale-while-revalidate) mientras Vercel la rehace por detrás. Antes eran 10 minutos: la
// primera visita después de un rato sin visitas esperaba arranque de la función + backend +
// revisión de la foto, ~1,7 s de pantalla en blanco. Lo único que puede quedar viejo es el
// título y la vista previa, que WhatsApp de todos modos guarda por días.
//
// Además la cabecera adelanta trabajo al navegador (ver aceleradores): abre ya la conexión con
// la API y con el almacén de fotos, y empieza a pedir la tienda mientras baja el JavaScript.
//
// Solo corre en Vercel (ver rewrites de vercel.json). En Docker nginx sirve index.html tal cual.

const { direcciones } = require("./_sitio");

const ESPERA_MS = 2500;

// La vista previa de WhatsApp va sin precio, a propósito. WhatsApp guarda la vista previa días y el
// precio cambia; el precio va solo en el JSON-LD, que Google relee seguido.
const CACHE_OK = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_404 = "public, max-age=0, s-maxage=60";

let plantilla = null; // index.html del despliegue: no cambia mientras viva la instancia

async function conEspera(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPERA_MS);
  try { return await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json, text/html" } }); }
  finally { clearTimeout(t); }
}

async function leerPlantilla(origen) {
  if (plantilla) return plantilla;
  const res = await conEspera(`${origen}/index.html`);
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  plantilla = await res.text();
  return plantilla;
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const recortar = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// Las fotos de Supabase ya son URL completas; las locales (/uploads/...) se completan contra
// el backend, que es quien las sirve.
const absoluta = (url, base) => (!url ? null : /^https?:\/\//i.test(url) ? url : `${base}${url}`);

// La foto de la vista previa tiene que ser JPEG o PNG de menos de unos 300 KB. Con una WebP
// WhatsApp en iPhone arma la tarjeta grande pero la deja borrosa (solo usa la miniatura), y
// con una muy pesada no la muestra. Casi todas las fotos ya sirven (en octubre de 2026, de
// 4.935: 484 WebP y 42 de más de 300 KB), así que se mira con un HEAD y solo las que no
// sirven se piden a la transformación de Supabase, que se cobra por imagen distinta al mes.
//
// format=origin es lo que la saca en JPEG: sin él Supabase responde WebP a quien lo acepte, y
// "jpeg" no es un valor admitido. Con origin una WebP sale en JPEG y una PNG sigue en PNG.
// Una PNG pesada se lleva a 500 px (la más pesada del bucket queda en 218 KB); el resto a 800.
// Solo para la vista previa: el JSON-LD lleva la original.
const PESO_MAX_PREVIEW = 300 * 1024;
const OBJETO_PUBLICO = "/storage/v1/object/public/";

async function fotoPreview(url) {
  if (!url || !url.includes(OBJETO_PUBLICO)) return url;
  let tipo;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal }).finally(() => clearTimeout(t));
    const peso = parseInt(r.headers.get("content-length"), 10);
    tipo = String(r.headers.get("content-type") || "").toLowerCase();
    if (/image\/(jpe?g|png)/.test(tipo) && !(peso > PESO_MAX_PREVIEW)) return url;
  } catch {
    return url; // sin respuesta: mejor la original que ninguna
  }
  const lado = tipo.includes("png") ? 500 : 800;
  return `${url.replace(OBJETO_PUBLICO, "/storage/v1/render/image/public/")}?width=${lado}&height=${lado}&resize=contain&quality=75&format=origin`;
}

// JSON dentro de <script>: "</script>" en un nombre de producto cerraría la etiqueta.
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

async function cabecera({ store, product }, { url, origen, api }) {
  const logo = absoluta(store.logo_url, api);
  const lugar = [store.address, store.city].filter(Boolean).join(", ");

  let titulo, descripcion, imagen, ld;
  if (product) {
    titulo = `${product.name} · ${store.name}`;
    descripcion = recortar(product.description || `${product.name}, en el catálogo de ${store.name}.`, 160);
    imagen = absoluta(product.image_url, api) || logo;
    const offer = product.price_usd != null
      ? {
          "@type": "Offer",
          url,
          price: Number(product.price_usd).toFixed(2),
          priceCurrency: "USD",
          ...(product.available != null && {
            availability: `https://schema.org/${product.available ? "InStock" : "OutOfStock"}`,
          }),
          seller: { "@type": "Organization", name: store.name },
        }
      : undefined;
    ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      url,
      ...(imagen && { image: [imagen] }),
      ...(product.description && { description: recortar(product.description, 500) }),
      ...(product.brand && { brand: { "@type": "Brand", name: product.brand } }),
      ...(offer && { offers: offer }),
    };
  } else {
    titulo = `${store.name} · Catálogo en línea`;
    descripcion = recortar(store.slogan ? `${store.slogan}. Mira el catálogo de ${store.name} y haz tu pedido.` : `Mira el catálogo de ${store.name} y haz tu pedido en línea.`, 160);
    imagen = logo;
    ld = {
      "@context": "https://schema.org",
      "@type": "Store",
      name: store.name,
      url,
      ...(logo && { image: logo, logo }),
      ...(store.slogan && { description: store.slogan }),
      ...(store.phone && { telephone: store.phone }),
      ...(lugar && {
        address: {
          "@type": "PostalAddress",
          ...(store.address && { streetAddress: store.address }),
          ...(store.city && { addressLocality: store.city }),
          addressCountry: "VE",
        },
      }),
    };
  }
  imagen = imagen || `${origen}/icon-512.png`;
  const preview = await fotoPreview(imagen);

  const meta = [
    `<meta name="description" content="${esc(descripcion)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${product ? "product" : "website"}" />`,
    `<meta property="og:site_name" content="${esc(store.name)}" />`,
    `<meta property="og:title" content="${esc(titulo)}" />`,
    `<meta property="og:description" content="${esc(descripcion)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(preview)}" />`,
    `<meta property="og:image:alt" content="${esc(product ? product.name : store.name)}" />`,
    `<meta property="og:locale" content="es_VE" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${jsonLd(ld)}</script>`,
    // "Aparecer en Google" apagado en Gestión de Empresas: la vista previa de WhatsApp sigue,
    // pero los buscadores no la indexan (y la tienda tampoco entra al sitemap).
    ...(store.indexable === false ? [`<meta name="robots" content="noindex" />`] : []),
  ].join("\n    ");
  return { titulo, meta };
}

// La app pide la tienda con fetch(`${API}/api/public/catalog/<slug>?`) (publicApi.getStore, sin
// parámetros en la primera carga). El preload tiene que ser EXACTAMENTE esa URL, con el "?" del
// final, y crossorigin="anonymous" (el fetch va sin credenciales): si no coincide, el navegador
// la pide dos veces. El logo se adelanta porque es lo primero que se ve en la cabecera; también
// con crossorigin="anonymous", que es como lo carga StoreLogo (lo procesa en un lienzo).
function aceleradores({ api, slug, logo }) {
  const links = [];
  try { links.push(`<link rel="preconnect" href="${esc(new URL(api).origin)}" crossorigin />`); } catch { /* api relativa */ }
  try {
    if (logo && /^https?:/i.test(logo)) {
      const fotos = new URL(logo).origin;
      if (!links.some((l) => l.includes(fotos))) links.push(`<link rel="preconnect" href="${esc(fotos)}" />`);
      links.push(`<link rel="preload" as="image" crossorigin="anonymous" href="${esc(logo)}" />`);
    }
  } catch { /* logo raro: sin adelanto */ }
  links.push(`<link rel="preload" as="fetch" crossorigin="anonymous" href="${esc(`${api}/api/public/catalog/${encodeURIComponent(slug)}?`)}" />`);
  return links.join("\n    ");
}

function inyectar(html, { titulo, meta }) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(titulo)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/i, "")
    .replace(/<\/head>/i, `    ${meta}\n  </head>`);
}

module.exports = async (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origen = `https://${host}`;
  const api = String(process.env.API_URL || process.env.VITE_API_URL || origen).replace(/\/+$/, "");

  const slug = String(req.query.slug || "").toLowerCase();
  const pid = req.query.p ? String(req.query.p) : null;

  let html;
  try {
    html = await leerPlantilla(origen);
  } catch (err) {
    // Sin plantilla no hay nada que servir: que reintente el navegador.
    console.error("[vitrina] index.html", err.message);
    res.statusCode = 502;
    res.setHeader("Cache-Control", "no-store");
    return res.end("No se pudo cargar la página. Intenta de nuevo.");
  }

  const enviar = (status, cuerpo, cache) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    res.end(cuerpo);
  };

  if (!/^[a-z0-9-]{1,80}$/.test(slug) || (pid && !/^\d{1,10}$/.test(pid))) {
    return enviar(404, inyectar(html, { titulo: "Catálogo no disponible", meta: `<meta name="robots" content="noindex" />` }), CACHE_404);
  }

  let r;
  try {
    r = await conEspera(`${api}/api/public/catalog/${slug}/meta${pid ? `?p=${pid}` : ""}`);
  } catch (err) {
    console.error("[vitrina] meta", err.message);
    return enviar(200, html, "no-store");
  }

  // 404 de verdad para tienda o producto que no existe: la vitrina igual muestra su aviso,
  // pero Google no indexa la página y el rastreador de enlaces rotos la reconoce.
  if (r.status === 404) {
    return enviar(404, inyectar(html, { titulo: "No disponible", meta: `<meta name="robots" content="noindex" />` }), CACHE_404);
  }
  if (!r.ok) return enviar(200, html, "no-store");

  try {
    const { data } = await r.json();
    // Canónica con el dominio oficial (SITE_URL, ver _sitio.js), no con el de la visita.
    const url = `${direcciones(req).sitio}/catalogo/${slug}${pid ? `/p/${pid}` : ""}`;
    const cab = await cabecera(data, { url, origen, api });
    cab.meta += `\n    ${aceleradores({ api, slug, logo: absoluta(data.store?.logo_url, api) })}`;
    enviar(200, inyectar(html, cab), CACHE_OK);
  } catch (err) {
    console.error("[vitrina] cabecera", err.message);
    enviar(200, html, "no-store");
  }
};
