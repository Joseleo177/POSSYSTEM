/**
 * Regla de contraseñas de toda la plataforma (20-11-2026): mínimo 8 caracteres, al menos una
 * letra y un número, que no sea igual al usuario y que no esté entre las típicas. La misma regla vive en frontend/src/helpers/passwordPolicy.js para la lista en vivo
 * del formulario; el servidor es el que decide.
 *
 * Se aplica en tres lugares:
 *  - Al iniciar sesión: si la contraseña no cumple, el empleado queda marcado
 *    (must_change_password) y no puede trabajar hasta cambiarla (middleware/auth.js).
 *  - Al cambiarla uno mismo (/auth/change-password).
 *  - Cuando el admin crea un empleado o le pone una contraseña.
 */
const COMUNES = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
  "password", "password1", "password123", "passw0rd", "contraseña", "contrasena", "contrasena1",
  "qwerty123", "qwertyuiop", "abc12345", "abcd1234", "a1234567", "12345678a", "1q2w3e4r",
  "admin123", "admin1234", "administrador", "administrador1", "clave123", "clave1234",
  "venezuela", "venezuela1", "caracas123", "nexus123", "nxus1234", "iloveyou", "welcome1",
]);

function problemasClave(password, { username } = {}) {
  const clave = String(password ?? "");
  const problemas = [];
  if (clave.length < 8) problemas.push("Debe tener al menos 8 caracteres");
  if (!/\p{L}/u.test(clave)) problemas.push("Debe tener al menos una letra");
  if (!/\d/.test(clave)) problemas.push("Debe tener al menos un número");
  // Igual al usuario, sin importar mayúsculas. "usuario2026" pasa: se acordó así (20-11-2026),
  // entre otras cosas porque las cuentas demo que se comparten con prospectos usan ese patrón.
  if (username && clave.toLowerCase() === String(username).toLowerCase()) problemas.push("No puede ser igual a tu usuario");
  if (COMUNES.has(clave.toLowerCase())) problemas.push("Es de las contraseñas más usadas (como 12345678), lo primero que se prueba para entrar");
  return problemas;
}

const esClaveDebil = (password, ctx) => problemasClave(password, ctx).length > 0;

/** Error 400 listo para responder, con el primer problema como mensaje. */
function errorClave(problemas) {
  return Object.assign(new Error(`La contraseña no es segura: ${problemas[0].toLowerCase()}`), {
    status: 400, isOperational: true, problemas,
  });
}

module.exports = { problemasClave, esClaveDebil, errorClave };
