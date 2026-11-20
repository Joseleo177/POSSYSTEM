'use strict';

// Configuración del proveedor de IA: la llave y el modelo. Se editan en Configuración →
// Asistente IA (solo el superusuario) y viven en plataforma_ajustes, cifradas. Cambiarlas vale
// en el acto: no hay que redesplegar.
//
// Si no hay nada guardado, se usa DEEPSEEK_API_KEY / DEEPSEEK_MODEL del entorno (útil para una
// instalación local). Lo del panel manda sobre el entorno.

const { sequelize, Sequelize } = require("../../models");
const { cifrar, descifrar } = require("../../utils/secretos");

const CLAVE_LLAVE = "asistente.api_key";
const CLAVE_MODELO = "asistente.modelo";
const MODELO_DEFECTO = "deepseek-chat";
const URL_SALDO = process.env.DEEPSEEK_SALDO_URL || "https://api.deepseek.com/user/balance";

// Caché corta: en Vercel cada instancia tiene la suya, así que un cambio tarda como mucho esto en
// llegar a todas. Guardar desde el panel limpia la de la instancia que atendió.
const TTL_MS = 60_000;
let cache = null;

const operacional = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

async function leerFilas() {
  const filas = await sequelize.query(
    `SELECT clave, valor, updated_at FROM plataforma_ajustes WHERE clave IN (:claves)`,
    { replacements: { claves: [CLAVE_LLAVE, CLAVE_MODELO] }, type: Sequelize.QueryTypes.SELECT }
  );
  return Object.fromEntries(filas.map(f => [f.clave, f]));
}

async function obtener() {
  if (cache && Date.now() - cache.t < TTL_MS) return cache.v;
  const filas = await leerFilas();
  const delPanel = descifrar(filas[CLAVE_LLAVE]?.valor);
  const v = {
    apiKey: delPanel || process.env.DEEPSEEK_API_KEY || null,
    origen: delPanel ? "panel" : process.env.DEEPSEEK_API_KEY ? "entorno" : null,
    // Guardada pero ilegible: cambió JWT_SECRET. Hay que volver a pegarla.
    ilegible: !!filas[CLAVE_LLAVE]?.valor && !delPanel,
    modelo: filas[CLAVE_MODELO]?.valor || process.env.DEEPSEEK_MODEL || MODELO_DEFECTO,
    actualizada: filas[CLAVE_LLAVE]?.updated_at || null,
  };
  cache = { t: Date.now(), v };
  return v;
}

// Lo que ve la pantalla: nunca la llave, solo sus últimos 4 caracteres.
async function estadoPublico() {
  const c = await obtener();
  return {
    configurada: !!c.apiKey,
    origen: c.origen,
    ilegible: c.ilegible,
    termina_en: c.apiKey ? c.apiKey.slice(-4) : null,
    modelo: c.modelo,
    actualizada: c.actualizada,
  };
}

async function guardarFila(clave, valor) {
  await sequelize.query(
    `INSERT INTO plataforma_ajustes (clave, valor, updated_at) VALUES (:clave, :valor, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
    { replacements: { clave, valor } }
  );
}

// api_key: texto nuevo para cambiarla, "" para borrarla, undefined para dejarla como está.
async function guardar({ api_key, modelo }) {
  if (api_key !== undefined) {
    const k = String(api_key || "").trim();
    if (k && (k.length < 20 || /\s/.test(k))) throw operacional("Esa llave no parece válida.");
    if (k) await guardarFila(CLAVE_LLAVE, cifrar(k));
    else await sequelize.query(`DELETE FROM plataforma_ajustes WHERE clave = :c`, { replacements: { c: CLAVE_LLAVE } });
  }
  if (modelo !== undefined) {
    const m = String(modelo || "").trim();
    if (m && !/^[\w.:-]{2,60}$/.test(m)) throw operacional("Nombre de modelo inválido.");
    await guardarFila(CLAVE_MODELO, m || MODELO_DEFECTO);
  }
  cache = null;
  return estadoPublico();
}

// Comprueba la llave contra DeepSeek y trae el saldo de la cuenta. No gasta tokens.
async function probar() {
  const { apiKey } = await obtener();
  if (!apiKey) throw operacional("Primero guarda una llave.");
  let res;
  try {
    res = await fetch(URL_SALDO, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw operacional("No hay conexión con DeepSeek desde el servidor.", 502);
  }
  if (res.status === 401) throw operacional("DeepSeek rechazó la llave: revisa que esté bien copiada y activa.");
  if (!res.ok) throw operacional(`DeepSeek respondió con un error (${res.status}).`, 502);
  const data = await res.json().catch(() => ({}));
  return {
    disponible: data.is_available !== false,
    saldos: (data.balance_infos || []).map(b => ({ moneda: b.currency, total: parseFloat(b.total_balance) || 0 })),
  };
}

module.exports = { obtener, estadoPublico, guardar, probar };
