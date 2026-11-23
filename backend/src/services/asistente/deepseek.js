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

// `opciones` es para la lectura de documentos (lectorCompra.js): otro modelo (con visión), más
// espera, más salida, temperatura 0 y respuesta en JSON. El chat usa los valores por defecto.
async function completar({ messages, tools, opciones = {} }) {
  const { apiKey, modelo } = await config.obtener();
  if (!apiKey) throw fallo("Asta todavía no está configurada. Avísale a soporte de NXUS.", 503);

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), opciones.espera_ms || ESPERA_MS);
  let res;
  try {
    res = await fetch(URL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opciones.modelo || modelo,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        temperature: opciones.temperature ?? 0.2,
        max_tokens: opciones.max_tokens || 1600,
        ...(opciones.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw fallo(opciones.msj_espera || "Asta tardó demasiado en responder. Intenta de nuevo.", 504);
    // Sin internet (la instalación local en Docker puede quedarse sin conexión).
    throw fallo("No hay conexión con Asta. Revisa el internet e intenta de nuevo.");
  } finally {
    clearTimeout(reloj);
  }

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    console.error("DeepSeek", res.status, cuerpo.slice(0, 500));
    if (res.status === 401) throw fallo("La llave de Asta no es válida. Avísale a soporte de NXUS.", 503);
    if (res.status === 402) throw fallo("El servicio de Asta no tiene saldo. Avísale a soporte.", 503);
    if (res.status === 429) throw fallo("Asta está muy ocupada. Intenta de nuevo en un momento.", 503);
    throw fallo("Asta no pudo responder. Intenta de nuevo.");
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
    fin: data.choices?.[0]?.finish_reason || null,
    uso: { cache, entrada, salida },
  };
}

const costoUsd = ({ cache, entrada, salida }) =>
  (cache * PRECIOS.cache + entrada * PRECIOS.entrada + salida * PRECIOS.salida) / 1_000_000;

module.exports = { completar, costoUsd };
