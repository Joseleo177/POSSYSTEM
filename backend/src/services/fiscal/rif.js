// RIF como lo piden el SENIAT, sus libros y la imprenta digital: letra + 8 dígitos + dígito
// verificador. Port de rif_seniat (gme_contabilidad_ve/models/retencion_base.py, Odoo 19), el mismo
// algoritmo que ya usan los libros y retenciones de esas compañías.
//
// Los clientes guardan la cédula sin el dígito ("V-18965432"); si ya lo trae (9 cifras) se recalcula
// igual. Lo que no es un RIF venezolano (un pasaporte con letras) va tal cual.

const VALOR_LETRA = { V: 1, E: 2, J: 3, P: 4, G: 5, C: 3 };
const PESOS = [3, 2, 7, 6, 5, 4, 3, 2];

// "V-18965432" -> "V189654324" (sin guiones: así va al TXT y al XML).
function rifSeniat(rif) {
  const limpio = String(rif || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let [letra, numero] = VALOR_LETRA[limpio[0]] ? [limpio[0], limpio.slice(1)] : ["V", limpio];
  if (!/^\d+$/.test(numero) || numero.length > 9) return limpio;
  // RIF jurídico viejo (J-0xxxxxxx-d) guardado sin el cero inicial y con su dígito: los de 8 cifras
  // empiezan por 2, 3, 4 o 5, así que J-85087524 es J-08508752-4.
  if ("JGC".includes(letra) && numero.length === 8 && "16789".includes(numero[0])) numero = "0" + numero;
  numero = numero.length === 9 ? numero.slice(0, 8) : numero.padStart(8, "0");
  const resto = (VALOR_LETRA[letra] * 4 + [...numero].reduce((a, d, i) => a + Number(d) * PESOS[i], 0)) % 11;
  return `${letra}${numero}${resto === 0 || resto === 1 ? 0 : 11 - resto}`;
}

// Para leer: "V-18965432-4". Lo que no es un RIF se devuelve como estaba.
function rifConGuiones(rif) {
  const r = rifSeniat(rif);
  return /^[VEJPGC]\d{9}$/.test(r) ? `${r[0]}-${r.slice(1, 9)}-${r[9]}` : (rif || "");
}

module.exports = { rifSeniat, rifConGuiones };
