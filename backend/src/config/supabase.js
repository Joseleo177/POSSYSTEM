const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = "products";

async function uploadImage(buffer, filename, mimetype) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function deleteImage(filename) {
  if (!filename) return;
  await supabase.storage.from(BUCKET).remove([filename]);
}

// Copia un archivo ya existente dentro del bucket, sin descargarlo ni volver a subirlo: es una
// sola llamada del lado de Supabase. Clave en Vercel, donde el tiempo de reloj se factura y
// bajar+subir cada imagen por la función alargaría la petición hasta el timeout.
async function copyImage(fromPath, toPath) {
  const { error } = await supabase.storage.from(BUCKET).copy(fromPath, toPath);
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(toPath);
  return data.publicUrl;
}

module.exports = { uploadImage, deleteImage, copyImage };
