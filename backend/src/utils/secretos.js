'use strict';

// Cifrado de secretos guardados en la base (llaves de servicios externos). AES-256-GCM con una
// llave derivada de JWT_SECRET: un respaldo de la base no deja la llave a la vista.
//
// Si JWT_SECRET cambia, lo guardado ya no se puede descifrar: descifrar() devuelve null y el
// superusuario vuelve a pegar la llave en Configuración. No rompe nada más.

const crypto = require("crypto");

const llave = () => crypto.createHash("sha256").update(`nxus-secretos:${process.env.JWT_SECRET || ""}`).digest();

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${datos.toString("base64")}`;
}

function descifrar(guardado) {
  if (!guardado || !guardado.startsWith("v1:")) return null;
  try {
    const [, iv, tag, datos] = guardado.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", llave(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(datos, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { cifrar, descifrar };
