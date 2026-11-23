'use strict';

/**
 * Principios activos de un medicamento (módulo Farmacia).
 *
 * Un medicamento puede combinar varios ("Loratadina + Pseudoefedrina", "Amoxicilina + Ácido
 * clavulánico"). Se guardan en la misma columna `products.active_ingredient`, unidos por " + ".
 * Al leer también se aceptan "/" y ";", que es como suelen venir escritos en las cajas y en las
 * listas de los droguistas.
 *
 * Para comparar se usa el CONJUNTO de principios normalizado (sin tildes ni mayúsculas, sin
 * importar el orden), principio por principio: con un "contiene" de texto, "loratadina"
 * encontraría "desloratadina", que es otro medicamento.
 *
 * El frontend tiene su espejo en helpers/principios.js.
 */

const SEPARADOR = /\s*(?:\+|\/|;)\s*/;

const norm = (s) => String(s || "").trim().replace(/\s+/g, " ")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Loratadina + pseudoefedrina / Loratadina" → ["Loratadina", "pseudoefedrina"] (sin repetidos). */
function separar(texto) {
  const vistos = new Set();
  const out = [];
  for (const p of String(texto || "").split(SEPARADOR)) {
    const limpio = p.trim().replace(/\s+/g, " ");
    const k = norm(limpio);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(limpio);
  }
  return out;
}

/** Texto canónico para guardar: los principios unidos por " + ", o null si no hay ninguno. */
function unir(lista) {
  const l = separar(Array.isArray(lista) ? lista.join(" + ") : lista);
  return l.length ? l.join(" + ") : null;
}

/** Claves normalizadas del conjunto, para comparar. */
const claves = (texto) => new Set(separar(texto).map(norm));

module.exports = { separar, unir, claves, norm };
