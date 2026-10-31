// Sitemap para Google. /sitemap.xml es un índice con un sitemap por tienda
// (/sitemap/<tienda>), y cada uno lista la portada de la vitrina y sus productos visibles.
// Solo entran las empresas con catálogo y "Aparecer en Google" encendidos.
//
// La CDN de Vercel lo guarda un día: Google lo pide a menudo, pero el backend recibe como
// mucho una consulta por tienda al día. Un despliegue nuevo vacía esa caché.
const { direcciones, apiBase, conEspera } = require("./_sitio");

const CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const loc = (url, lastmod) =>
  `<url><loc>${esc(url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;

module.exports = async (req, res) => {
  const { local, sitio } = direcciones(req);
  const api = apiBase(local);
  const slug = req.query.slug ? String(req.query.slug).toLowerCase() : null;

  const enviar = (status, cuerpo, cache) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    res.end(cuerpo);
  };

  if (slug && !/^[a-z0-9-]{1,80}$/.test(slug)) return enviar(404, "", "public, max-age=0, s-maxage=3600");

  let r;
  try {
    r = await conEspera(`${api}/api/public/catalog/_sitemap${slug ? `/${slug}` : ""}`, 8000, { headers: { accept: "application/json" } });
  } catch (err) {
    console.error("[sitemap]", err.message);
    return enviar(503, "", "no-store"); // Google reintenta más tarde
  }
  if (r.status === 404) return enviar(404, "", "public, max-age=0, s-maxage=3600");
  if (!r.ok) return enviar(503, "", "no-store");
  const { data } = await r.json();

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  if (!slug) {
    const items = data.map((t) =>
      `<sitemap><loc>${esc(`${sitio}/sitemap/${t.slug}`)}</loc>${t.lastmod ? `<lastmod>${fecha(t.lastmod)}</lastmod>` : ""}</sitemap>`);
    return enviar(200, `${xml}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`, CACHE);
  }

  const portada = `${sitio}/catalogo/${data.slug}`;
  const ultima = data.products.reduce((m, p) => (!m || p.updated_at > m ? p.updated_at : m), null);
  const urls = [
    loc(portada, fecha(ultima)),
    ...data.products.map((p) => loc(`${portada}/p/${p.id}`, fecha(p.updated_at))),
  ];
  enviar(200, `${xml}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`, CACHE);
};
