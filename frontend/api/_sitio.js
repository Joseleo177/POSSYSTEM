// Ayudantes comunes de las funciones de Vercel. El "_" del nombre hace que Vercel no lo
// publique como función.

// Dirección de este despliegue (de donde se lee index.html) y dominio oficial del sitio (con
// el que se arman canónicas, sitemap y vista previa). Son el mismo hasta que exista un dominio
// propio: entonces se define SITE_URL en Vercel y, aunque alguien entre por el dominio viejo,
// Google ve siempre el nuevo como el principal.
function direcciones(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const local = `https://${host}`;
  const sitio = String(process.env.SITE_URL || local).replace(/\/+$/, "");
  return { local, sitio };
}

// Backend. En Vercel es otro proyecto: el mismo VITE_API_URL con que se construye el frontend.
const apiBase = (respaldo) => String(process.env.API_URL || process.env.VITE_API_URL || respaldo).replace(/\/+$/, "");

async function conEspera(url, ms, opciones = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opciones, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

module.exports = { direcciones, apiBase, conEspera };
