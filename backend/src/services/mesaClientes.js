const crypto = require("crypto");
const { Setting, Customer, sequelize, Sequelize } = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");
const { SETTLED_SQL, DISPATCHED_SQL } = require("../utils/saleBalance");
const { parseDocument } = require("./publicCatalogService");
const { mesaDe } = require("./mesaPublica");

// Reconocer al cliente en el QR de la mesa (31-10-2026, "¿cómo sabrás que soy yo de nuevo si no
// me preguntas?"). Extra por empresa (ajuste `mesa_clientes`), apagado por defecto.
//
// Un APARATO es el navegador de un teléfono: la página guarda un código al azar y aquí solo
// llega su huella (sha256). Un cliente puede tener varios aparatos (customer_devices).
// El aparato se liga a un cliente por tres caminos:
//   1. Escribe su cédula (o la página la toma de su identidad del catálogo): queda confirmado.
//   2. Pidió desde ese aparato y la cuenta se cobró a un cliente: vínculo DEDUCIDO, sin
//      confirmar; la página pregunta "¿Eres José?" antes de usarlo. Si dice que no, la fila
//      queda `declined` y no se le vuelve a preguntar por ese cliente.
//   3. Se registra (cédula nueva + nombre): la ficha se crea al enviar su primer pedido, no
//      antes —igual que en el catálogo—, para que nadie llene la cartera sin comprar.
//
// Lo que se muestra de un cliente reconocido es su nombre de pila y sugerencias de platos:
// nunca montos, deudas ni historial de pagos (un teléfono prestado no debe enseñar eso).

const CLAVE = "mesa_clientes";
const TZ = process.env.DB_TIMEZONE || "America/Caracas";
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const huellaDe = (codigo) => {
  const c = String(codigo || "").trim();
  return /^[A-Za-z0-9_-]{16,64}$/.test(c) ? crypto.createHash("sha256").update(c).digest("hex") : null;
};

// "JOSE LEONARDO MUJICA" → "Jose". El nombre se guarda en mayúsculas desde el POS.
const nombreDePila = (nombre) => {
  const p = String(nombre || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : null;
};

async function activo(cid) {
  const s = await Setting.findOne({ where: { company_id: cid, key: CLAVE }, attributes: ["value"] });
  return s?.value === "true";
}

// Por documento sin importar el formato guardado, como findCustomerByDocument del catálogo, pero
// con la empresa a mano: aquí se corre sin tenant.
async function clientePorDoc(cid, normalized, transaction) {
  const [c] = await sequelize.query(`
    SELECT id, name FROM customers
     WHERE company_id = :cid AND regexp_replace(upper(rif), '[^A-Z0-9]', '', 'g') = :n
     LIMIT 1`,
    { replacements: { cid, n: normalized }, type: Sequelize.QueryTypes.SELECT, transaction });
  return c || null;
}

async function ligar(cid, h, customerId, confirmed, transaction) {
  await sequelize.query(`
    INSERT INTO customer_devices (company_id, customer_id, device_hash, confirmed, declined)
    VALUES (:cid, :cust, :h, :conf, false)
    ON CONFLICT (company_id, device_hash) DO UPDATE
      SET customer_id = EXCLUDED.customer_id, confirmed = EXCLUDED.confirmed, declined = false, last_seen_at = NOW()`,
    { replacements: { cid, cust: customerId, h, conf: !!confirmed }, transaction });
}

// El último cliente al que se le cobró una cuenta con pedidos hechos desde este aparato. Sin
// fichas sin documento (el "Cliente General" del mostrador no es nadie).
async function deducido(cid, h) {
  const [r] = await sequelize.query(`
    SELECT s.customer_id
      FROM table_orders o
      JOIN sales s ON s.id = o.sale_id
      JOIN customers c ON c.id = s.customer_id
     WHERE o.company_id = :cid AND o.device_hash = :h AND o.status = 'aceptado'
       AND s.status IN (${SETTLED_SQL})
       AND COALESCE(trim(c.rif), '') <> ''
     ORDER BY o.id DESC
     LIMIT 1`,
    { replacements: { cid, h }, type: Sequelize.QueryTypes.SELECT });
  return r?.customer_id || null;
}

// Lo que el cliente suele pedir, de sus ventas del último año en esta empresa. Dos consultas por
// el índice de sales.customer_id, solo cuando abre la página con su aparato confirmado.
async function sugerencias(cid, customerId) {
  const filas = await sequelize.query(`
    SELECT si.product_id,
           COUNT(DISTINCT s.id) AS veces,
           COUNT(DISTINCT s.id) FILTER (
             WHERE LEAST(abs(extract(hour FROM s.created_at AT TIME ZONE :tz) - extract(hour FROM NOW() AT TIME ZONE :tz)),
                         24 - abs(extract(hour FROM s.created_at AT TIME ZONE :tz) - extract(hour FROM NOW() AT TIME ZONE :tz))) <= 2
           ) AS en_hora,
           MAX(s.created_at) AS ultima
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
     WHERE s.company_id = :cid AND s.customer_id = :cust
       AND s.status IN (${DISPATCHED_SQL})
       AND s.created_at > NOW() - INTERVAL '365 days'
       AND si.product_id IS NOT NULL AND si.price > 0
     GROUP BY si.product_id
     ORDER BY veces DESC, ultima DESC
     LIMIT 60`,
    { replacements: { cid, cust: customerId, tz: TZ }, type: Sequelize.QueryTypes.SELECT });
  const [v] = await sequelize.query(`
    SELECT COUNT(DISTINCT (s.created_at AT TIME ZONE :tz)::date) AS visitas
      FROM sales s
     WHERE s.company_id = :cid AND s.customer_id = :cust AND s.status IN (${DISPATCHED_SQL}) AND s.is_prior_debt IS NOT TRUE`,
    { replacements: { cid, cust: customerId, tz: TZ }, type: Sequelize.QueryTypes.SELECT });

  const n = (x) => parseInt(x, 10) || 0;
  // "Lo de siempre": lo que pidió en más de una visita; con una sola visita, lo que pidió.
  const repetidos = filas.filter(f => n(f.veces) >= 2);
  const siempre = (repetidos.length ? repetidos : filas).slice(0, 3).map(f => f.product_id);
  // "A esta hora": lo que suele pedir en esta franja (±2 h), sin repetir lo de siempre.
  const ahora = filas.filter(f => n(f.en_hora) > 0 && !siempre.includes(f.product_id))
    .sort((a, b) => n(b.en_hora) - n(a.en_hora)).slice(0, 4).map(f => f.product_id);
  return {
    visits: n(v?.visitas),
    usual: siempre,
    now: ahora,
    // Todo lo que ya probó: la página saca de aquí "No has probado" (favoritos de la casa que
    // no están en esta lista).
    tried: filas.map(f => f.product_id),
  };
}

/** Quién es este aparato para esta tienda: { enabled, customer: { name, confirmed } | null, suggestions }. */
async function quien(token, codigo) {
  return runWithoutTenant(async () => {
    const { company } = await mesaDe(token);
    const cid = company.id;
    if (!(await activo(cid))) return { data: { enabled: false } };
    const h = huellaDe(codigo);
    if (!h) return { data: { enabled: true, customer: null } };

    const leer = async () => (await sequelize.query(`
      SELECT d.customer_id, d.confirmed, d.declined, c.name
        FROM customer_devices d JOIN customers c ON c.id = d.customer_id
       WHERE d.company_id = :cid AND d.device_hash = :h`,
      { replacements: { cid, h }, type: Sequelize.QueryTypes.SELECT }))[0] || null;

    let fila = await leer();
    // Sin vínculo (o con uno rechazado): ¿se le cobró a alguien una cuenta pedida desde aquí?
    if (!fila || fila.declined) {
      const cust = await deducido(cid, h);
      if (cust && cust !== fila?.customer_id) {
        await ligar(cid, h, cust, false);
        fila = await leer();
      }
    } else {
      sequelize.query(`UPDATE customer_devices SET last_seen_at = NOW() WHERE company_id = :cid AND device_hash = :h`,
        { replacements: { cid, h } }).catch(() => {});
    }
    if (!fila || fila.declined) return { data: { enabled: true, customer: null } };

    return {
      data: {
        enabled: true,
        customer: { name: nombreDePila(fila.name), confirmed: !!fila.confirmed },
        suggestions: fila.confirmed ? await sugerencias(cid, fila.customer_id) : null,
      },
    };
  });
}

/** "Sí, soy yo" (si = true) o "No, soy otra persona". */
async function confirmar(token, codigo, si) {
  const h = huellaDe(codigo);
  if (!h) throw fail("Aparato no válido");
  await runWithoutTenant(async () => {
    const { company } = await mesaDe(token);
    await sequelize.query(`
      UPDATE customer_devices SET confirmed = :si, declined = NOT :si, last_seen_at = NOW()
       WHERE company_id = :cid AND device_hash = :h`,
      { replacements: { cid: company.id, h, si: !!si } });
  });
  return quien(token, codigo);
}

/**
 * El cliente escribe su cédula. Con ficha: el aparato queda suyo y confirmado. Sin ficha:
 * { found: false } y la página le pide el nombre (la ficha se crea al pedir, ver alPedir).
 */
async function identificar(token, codigo, documento) {
  const h = huellaDe(codigo);
  if (!h) throw fail("Aparato no válido");
  const doc = parseDocument(documento);
  if (!doc) throw fail("Escribe tu cédula, por ejemplo V-12345678");
  const encontrado = await runWithoutTenant(async () => {
    const { company } = await mesaDe(token);
    if (!(await activo(company.id))) throw fail("Esta tienda no reconoce clientes en la mesa", 403);
    const c = await clientePorDoc(company.id, doc.normalized);
    if (c) await ligar(company.id, h, c.id, true);
    return !!c;
  });
  if (!encontrado) return { data: { enabled: true, found: false, document: doc.canonical, customer: null } };
  const r = await quien(token, codigo);
  return { data: { ...r.data, found: true } };
}

/**
 * Al enviar un pedido desde un aparato que se registró (cédula nueva + nombre): se crea la
 * ficha —o se usa la que ya exista con esa cédula, sin tocar sus datos: el formulario es
 * público— y el aparato queda ligado. Corre dentro de la transacción y sin tenant de pedir().
 */
async function alPedir(cid, h, registro, transaction) {
  if (!h || !registro) return;
  if (!(await activo(cid))) return;
  const doc = parseDocument(registro.document);
  const nombre = String(registro.name || "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 200);
  if (!doc || nombre.length < 3) return;
  const telefono = String(registro.phone || "").replace(/[^\d+]/g, "").slice(0, 20) || null;

  let c = await clientePorDoc(cid, doc.normalized, transaction);
  if (!c) {
    try {
      const nuevo = await Customer.create({ type: "cliente", name: nombre, phone: telefono, rif: doc.canonical, company_id: cid }, { transaction });
      c = { id: nuevo.id };
    } catch (err) {
      if (err?.name !== "SequelizeUniqueConstraintError") throw err;
      c = await clientePorDoc(cid, doc.normalized, transaction);
      if (!c) throw err;
    }
  }
  await ligar(cid, h, c.id, true, transaction);
}

module.exports = { quien, confirmar, identificar, alPedir, huellaDe, CLAVE };
