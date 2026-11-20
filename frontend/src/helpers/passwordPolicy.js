// Espejo de backend/src/utils/passwordPolicy.js, solo para la lista en vivo del formulario: el
// servidor es el que decide. Si cambia la regla allá, cambia aquí.
const COMUNES = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
  "password", "password1", "password123", "passw0rd", "contraseña", "contrasena", "contrasena1",
  "qwerty123", "qwertyuiop", "abc12345", "abcd1234", "a1234567", "12345678a", "1q2w3e4r",
  "admin123", "admin1234", "administrador", "administrador1", "clave123", "clave1234",
  "venezuela", "venezuela1", "caracas123", "nexus123", "nxus1234", "iloveyou", "welcome1",
]);

/**
 * Las reglas con su estado, en el orden en que se muestran. Las dos últimas solo aparecen
 * cuando fallan: decir de entrada "que no sea tu usuario" es ruido.
 */
export function reglasClave(password, username) {
  const clave = String(password ?? "");
  const reglas = [
    { id: "largo",  label: "Al menos 8 caracteres", ok: clave.length >= 8 },
    { id: "letra",  label: "Una letra",              ok: /\p{L}/u.test(clave) },
    { id: "numero", label: "Un número",              ok: /\d/.test(clave) },
  ];
  if (username && clave && clave.toLowerCase() === String(username).toLowerCase()) {
    reglas.push({ id: "usuario", label: "Que no sea igual a tu usuario", ok: false });
  }
  if (COMUNES.has(clave.toLowerCase())) {
    reglas.push({ id: "comun", label: "Que no sea de las más usadas (como 12345678)", ok: false });
  }
  return reglas;
}

export const claveCumple = (password, username) => reglasClave(password, username).every((r) => r.ok);

/**
 * Fuerza para la barra: 0 vacía, 1–2 débil, 3 cumple la regla, 4 además es larga (12+) o lleva
 * un símbolo. Que cumpla la regla ya es "buena": la barra no exige más que el servidor.
 */
export function fuerzaClave(password, username) {
  const clave = String(password ?? "");
  if (!clave) return 0;
  const cumple = claveCumple(clave, username);
  const base = reglasClave(clave, username).slice(0, 3).filter((r) => r.ok).length;
  if (!cumple) return Math.min(base, 2) || 1;
  return clave.length >= 12 || /[^\p{L}\d]/u.test(clave) ? 4 : 3;
}
