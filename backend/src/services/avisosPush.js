const webpush = require("web-push");
const { Setting, sequelize, Sequelize } = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");

// Avisos al teléfono del cliente con Web Push (05-11-2026). Fase 1: "Tu pedido está listo" desde
// el QR de la mesa, cuando la cocina marca una ronda como lista (services/kitchen.js).
//
// Es gratis: el aviso lo entrega el servicio del navegador (Google en Android, Apple en iPhone
// con la página agregada a la pantalla de inicio). Hace falta HTTPS —en Docker local por http no
// funciona— y las llaves VAPID en las variables de entorno del backend (VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT). Sin llaves, todo esto queda apagado en silencio.
//
// Extra por empresa (ajuste `mesa_avisos`), apagado por defecto.
//
// Vercel cobra el tiempo de reloj y corta lo que queda pendiente tras responder: los envíos se
// esperan antes de responder, con un tope de 4 s cada uno y en paralelo.

const CLAVE = "mesa_avisos";
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

let configurado = null;
function configurar() {
  if (configurado !== null) return configurado;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: sub } = process.env;
  if (!pub || !priv) return (configurado = false);
  try {
    webpush.setVapidDetails(sub || "mailto:avisos@nxus.app", pub, priv);
    configurado = true;
  } catch (e) {
    console.error("[avisos] llaves VAPID no válidas:", e.message);
    configurado = false;
  }
  return configurado;
}

/** La llave pública que necesita el navegador para suscribirse, o null si no hay avisos. */
const clavePublica = () => (configurar() ? process.env.VAPID_PUBLIC_KEY : null);

async function activo(cid) {
  if (!configurar()) return false;
  const s = await Setting.findOne({ where: { company_id: cid, key: CLAVE }, attributes: ["value"] });
  return s?.value === "true";
}

// El servidor hace una petición a la dirección que manda el navegador: solo se aceptan las de los
// servicios de avisos reales. Si no, cualquiera podría usar el servidor para llamar a otra parte.
const SERVICIOS = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.wns\.windows\.com)\//i;

function leerSuscripcion(raw) {
  const endpoint = String(raw?.endpoint || "").trim();
  const p256dh = String(raw?.keys?.p256dh || "").trim();
  const auth = String(raw?.keys?.auth || "").trim();
  if (endpoint.length > 1000 || !SERVICIOS.test(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/**
 * El cliente acepta los avisos en la página de la mesa (o la vuelve a abrir con el permiso ya
 * dado): se guarda o se actualiza su suscripción y queda "siguiendo" esa mesa desde ahora.
 */
async function suscribir(token, body = {}) {
  const { mesaDe } = require("./mesaPublica");
  const { huellaDe } = require("./mesaClientes");
  const sus = leerSuscripcion(body.subscription);
  if (!sus) throw fail("Suscripción de avisos no válida");
  await runWithoutTenant(async () => {
    const { mesa, company } = await mesaDe(token);
    const cid = company.id;
    if (!(await activo(cid))) throw fail("Esta tienda no envía avisos", 403);
    const h = huellaDe(body.device);
    // El cliente, si este aparato ya es de alguien confirmado (ver services/mesaClientes.js).
    const [cliente] = h ? await sequelize.query(
      `SELECT customer_id FROM customer_devices WHERE company_id = :cid AND device_hash = :h AND confirmed AND NOT declined`,
      { replacements: { cid, h }, type: Sequelize.QueryTypes.SELECT }) : [];
    await sequelize.query(`
      INSERT INTO push_subscriptions (company_id, endpoint, p256dh, auth, device_hash, customer_id, table_id, table_at)
      VALUES (:cid, :endpoint, :p256dh, :auth, :h, :cust, :mesa, NOW())
      ON CONFLICT (company_id, endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
            device_hash = COALESCE(EXCLUDED.device_hash, push_subscriptions.device_hash),
            customer_id = COALESCE(EXCLUDED.customer_id, push_subscriptions.customer_id),
            table_id = EXCLUDED.table_id, table_at = NOW(), fails = 0`,
      { replacements: { cid, ...sus, h, cust: cliente?.customer_id || null, mesa: mesa.id } });
  });
  return { data: { ok: true } };
}

/** "No recibir más avisos": se borra la suscripción de ese navegador. */
async function desuscribir(token, body = {}) {
  const { mesaDe } = require("./mesaPublica");
  const endpoint = String(body.endpoint || "").trim().slice(0, 1000);
  if (!endpoint) return { data: { ok: true } };
  await runWithoutTenant(async () => {
    const { company } = await mesaDe(token);
    await sequelize.query(`DELETE FROM push_subscriptions WHERE company_id = :cid AND endpoint = :endpoint`,
      { replacements: { cid: company.id, endpoint } });
  });
  return { data: { ok: true } };
}

/** Al pedir desde el QR: el aparato sigue a esa mesa desde ahora (sin consultar nada más). */
async function seguirMesa(cid, deviceHash, tableId) {
  if (!deviceHash) return;
  await sequelize.query(
    `UPDATE push_subscriptions SET table_id = :mesa, table_at = NOW() WHERE company_id = :cid AND device_hash = :h`,
    { replacements: { cid, h: deviceHash, mesa: tableId } });
}

/**
 * Manda un aviso a varias suscripciones. Las que el servicio da por muertas (404/410) se borran;
 * las que fallan por otra cosa suman un fallo y a los 5 seguidos también se borran.
 */
async function enviar(filas, aviso) {
  if (!filas.length || !configurar()) return { ok: 0, fallidos: 0 };
  const cuerpo = JSON.stringify(aviso);
  const res = await Promise.allSettled(filas.map(f => webpush.sendNotification(
    { endpoint: f.endpoint, keys: { p256dh: f.p256dh, auth: f.auth } },
    cuerpo,
    { TTL: 30 * 60, timeout: 4000, urgency: "high", topic: aviso.tag ? String(aviso.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined },
  )));
  const ok = [], muertos = [], fallidos = [];
  res.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push(filas[i].id);
    else if ([404, 410].includes(r.reason?.statusCode)) muertos.push(filas[i].id);
    else { fallidos.push(filas[i].id); console.error("[avisos] no se pudo enviar:", r.reason?.statusCode || "", r.reason?.message || r.reason); }
  });
  if (ok.length) await sequelize.query(`UPDATE push_subscriptions SET last_ok_at = NOW(), fails = 0 WHERE id IN (:ids)`, { replacements: { ids: ok } });
  if (muertos.length) await sequelize.query(`DELETE FROM push_subscriptions WHERE id IN (:ids)`, { replacements: { ids: muertos } });
  if (fallidos.length) {
    await sequelize.query(`UPDATE push_subscriptions SET fails = fails + 1 WHERE id IN (:ids)`, { replacements: { ids: fallidos } });
    await sequelize.query(`DELETE FROM push_subscriptions WHERE id IN (:ids) AND fails >= 5`, { replacements: { ids: fallidos } });
  }
  return { ok: ok.length, fallidos: fallidos.length + muertos.length };
}

/**
 * La cocina marcó una ronda de mesa como lista: aviso a quienes están en esa mesa. Son los
 * aparatos que pidieron desde el QR en esa cuenta, y los que siguieron la mesa desde poco antes
 * de que se abriera la cuenta (los de la mesa anterior ya no).
 */
async function pedidoListo(cid, ticket) {
  if (!ticket?.table_id || !(await activo(cid))) return null;
  const filas = await sequelize.query(`
    SELECT p.id, p.endpoint, p.p256dh, p.auth
      FROM push_subscriptions p
     WHERE p.company_id = :cid
       AND (
         (p.table_id = :mesa
           AND p.table_at > NOW() - INTERVAL '6 hours'
           AND p.table_at > COALESCE((SELECT s.created_at - INTERVAL '30 minutes' FROM sales s WHERE s.id = :sale), NOW() - INTERVAL '6 hours'))
         OR p.device_hash IN (SELECT o.device_hash FROM table_orders o WHERE o.sale_id = :sale AND o.device_hash IS NOT NULL)
       )
     LIMIT 20`,
    { replacements: { cid, mesa: ticket.table_id, sale: ticket.sale_id || 0 }, type: Sequelize.QueryTypes.SELECT });
  if (!filas.length) return { ok: 0, fallidos: 0 };

  const [m] = await sequelize.query(`
    SELECT t.name, t.public_token,
           COALESCE((SELECT st.value FROM settings st WHERE st.company_id = t.company_id AND st.key = 'store_name'), c.name) AS tienda,
           (SELECT st.value FROM settings st WHERE st.company_id = t.company_id AND st.key = 'logo_filename') AS logo
      FROM dining_tables t JOIN companies c ON c.id = t.company_id
     WHERE t.id = :mesa`,
    { replacements: { mesa: ticket.table_id }, type: Sequelize.QueryTypes.SELECT });
  return enviar(filas, {
    title: m?.tienda || "Tu pedido",
    body: `${m?.name ? `${m.name}: t` : "T"}u pedido está listo. Ya te lo llevan a la mesa.`,
    url: m?.public_token ? `/mesa/${m.public_token}` : "/",
    // Solo URL completas (Supabase): un /uploads relativo no lo resuelve el aviso.
    icon: m?.logo && /^https:\/\//.test(m.logo) ? m.logo : undefined,
    tag: `listo-${ticket.id}`,
  });
}

module.exports = { CLAVE, clavePublica, activo, suscribir, desuscribir, seguirMesa, enviar, pedidoListo };
