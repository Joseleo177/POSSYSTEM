// robots.txt. Es una función y no un archivo fijo solo porque la línea Sitemap tiene que
// llevar la dirección completa, y el dominio va a cambiar (ver _sitio.js). La CDN la guarda un
// día: no le cuesta nada al backend, que ni se entera.
//
// El ERP es una sola página en "/" (el login): no hay rutas internas que esconder. Las mesas
// son privadas (además llevan X-Robots-Tag noindex) y la API no es para buscadores.
const { direcciones } = require("./_sitio");

module.exports = (req, res) => {
  const { sitio } = direcciones(req);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end([
    "User-agent: *",
    "Allow: /",
    "Disallow: /mesa/",
    "Disallow: /api/",
    "",
    `Sitemap: ${sitio}/sitemap.xml`,
    "",
  ].join("\n"));
};
