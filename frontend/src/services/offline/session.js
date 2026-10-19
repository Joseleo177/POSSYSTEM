import { kvGet, kvSet } from "./store";

// Entrar sin conexión.
//
// Si se va la luz y la PC arranca sin internet, el cajero que había cerrado sesión —o el del
// turno siguiente— no puede validar su contraseña contra el servidor. Para eso, cada vez que
// alguien entra CON internet en este equipo se guarda su acceso cifrado con su propia
// contraseña: sin ella no se puede leer, ni siquiera mirando el almacenamiento del navegador.
//
// De la contraseña se derivan dos claves (PBKDF2): una para comprobar que es la correcta y otra
// para descifrar la sesión guardada (sus datos y sus tokens). Al volver la conexión, la caja
// sigue con esos tokens y el servidor los renueva como siempre, rechazando a quien se haya
// desactivado mientras tanto.
//
// Vale 7 días desde la última entrada con internet, lo mismo que dura el refresh token: pasado
// eso el servidor ya no aceptaría la sesión, así que no tiene sentido abrirla.
//
// Necesita un contexto seguro (https o localhost): fuera de él el navegador no ofrece
// crypto.subtle y esto simplemente no se activa.

const ITERACIONES = 150_000;
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const claveDe = (username) => `cred:${String(username).trim().toLowerCase()}`;
const disponible = () => typeof crypto !== "undefined" && !!crypto.subtle;

async function derivar(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERACIONES }, base, 512,
  ));
  const aes = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { verificador: bits.slice(0, 32), aes };
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// Se llama tras un login correcto con internet.
export async function recordarAcceso(username, password, sesion) {
  if (!disponible() || !username || !password || !sesion?.token) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const { verificador, aes } = await derivar(password, salt);
    const datos = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, aes,
      enc.encode(JSON.stringify({
        employee: sesion.employee,
        token: sesion.token,
        refresh_token: sesion.refresh_token || null,
      })),
    );
    await kvSet(claveDe(username), { salt, iv, verificador, datos, guardado: Date.now() });
  } catch { /* sin cifrado disponible: no hay acceso sin conexión, nada más */ }
}

// Devuelve { employee, token, refresh_token } o lanza un error con un mensaje para la caja.
export async function entrarSinConexion(username, password) {
  const sinDatos = new Error(
    "No hay conexión y este usuario nunca entró en este equipo con internet. Pide a alguien que ya haya entrado aquí, o espera a que vuelva la conexión.",
  );
  if (!disponible()) throw sinDatos;
  const guardado = await kvGet(claveDe(username));
  if (!guardado) throw sinDatos;
  if (Date.now() - guardado.guardado > VIGENCIA_MS) {
    throw new Error("El acceso guardado en este equipo venció (más de 7 días sin entrar con internet). Hace falta conexión para entrar.");
  }
  const { verificador, aes } = await derivar(password, guardado.salt);
  if (!iguales(verificador, new Uint8Array(guardado.verificador))) {
    throw new Error("Contraseña incorrecta");
  }
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: guardado.iv }, aes, guardado.datos);
  return JSON.parse(dec.decode(plano));
}
