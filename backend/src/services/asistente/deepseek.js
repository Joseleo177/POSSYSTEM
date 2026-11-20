'use strict';

// Cliente mínimo de DeepSeek. Su API usa el mismo formato que OpenAI (chat/completions con
// tools), así que cambiar de proveedor es cambiar DEEPSEEK_URL, el modelo y la llave.
//
// No hay streaming a propósito: en Vercel se paga el reloj de la función y la respuesta llega
// entera en pocos segundos. La espera la cubre el indicador de "pensando" de la pantalla.

// La llave y el modelo se editan en Configuración → Asistente IA (ver config.js); el entorno
// queda solo como respaldo para instalaciones locales.
const config = require("./config");

const URL_API = process.env.DEEPSEEK_URL || "https://api.deepseek.com/chat/completions";
const ESPERA_MS = 25_000;

// Precios en dólares por millón de tokens. Solo sirven para anotar el costo de cada pregunta
// (asistente_mensajes.costo_usd); los precios de DeepSeek cambiaron varias veces en 2026, así
// que se ajustan por variable de entorno sin tocar el código.
const precio = (nombre, defecto) => {
  const v = parseFloat(process.env[nombre]);
  return Number.isFinite(v) ? v : defecto;
};
const PRECIOS = {
  entrada: precio("DEEPSEEK_PRECIO_ENTRADA", 0.30),
  cache:   precio("DEEPSEEK_PRECIO_CACHE",   0.006),
  salida:  precio("DEEPSEEK_PRECIO_SALIDA",  1.20),
};

const fallo = (message, status = 502) => Object.assign(new Error(message), { status, isOperational: true });

async function completar({ messages, tools }) {
  const { apiKey, modelo } = await config.obtener();
  if (!apiKey) throw fallo("El asistente todavía no está configurado. Avísale a soporte de NXUS.", 503);

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), ESPERA_MS);
  let res;
  try {
    res = await fetch(URL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        temperature: 0.2,
        max_tokens: 1600,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw fallo("El asistente tardó demasiado en responder. Intenta de nuevo.", 504);
    // Sin internet (la instalación local en Docker puede quedarse sin conexión).
    throw fallo("No hay conexión con el servicio del asistente. Revisa el internet e intenta de nuevo.");
  } finally {
    clearTimeout(reloj);
  }

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    console.error("DeepSeek", res.status, cuerpo.slice(0, 500));
    if (res.status === 401) throw fallo("La llave del asistente no es válida. Avísale a soporte de NXUS.", 503);
    if (res.status === 402) throw fallo("El servicio del asistente no tiene saldo. Avísale a soporte.", 503);
    if (res.status === 429) throw fallo("El asistente está muy ocupado. Intenta de nuevo en un momento.", 503);
    throw fallo("El asistente no pudo responder. Intenta de nuevo.");
  }

  const data = await res.json();
  const u = data.usage || {};
  // DeepSeek separa lo que encontró en su caché (prompt_cache_hit_tokens), que cuesta mucho
  // menos. Si un proveedor no lo informa, todo cuenta como entrada normal.
  const cache   = u.prompt_cache_hit_tokens || 0;
  const entrada = u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens || 0) - cache);
  const salida  = u.completion_tokens || 0;
  return {
    mensaje: data.choices?.[0]?.message || { role: "assistant", content: "" },
    uso: { cache, entrada, salida },
  };
}

const costoUsd = ({ cache, entrada, salida }) =>
  (cache * PRECIOS.cache + entrada * PRECIOS.entrada + salida * PRECIOS.salida) / 1_000_000;

module.exports = { completar, costoUsd };
