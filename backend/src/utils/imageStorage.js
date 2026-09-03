const path = require("path");
const fs   = require("fs");

// Guardado de imágenes, en el único lugar donde debería estar.
//
// El sistema corre en dos modos y cada uno guarda distinto: en Docker las imágenes van al
// disco del contenedor (volumen `uploads_data`) y se sirven desde /uploads; en la nube van
// al bucket de Supabase y lo que se guarda en la base es la URL completa. Por eso todas las
// columnas de imagen aceptan las dos formas, y por eso `imageUrl` mira si el valor empieza
// por http antes de armar la ruta.
//
// La decisión se toma en cada llamada y no al cargar el módulo: la misma imagen del sistema
// se despliega en local y en nube, y el modo depende de las variables de entorno del arranque.
const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../config/supabase");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Lo que se guarda en la base a lo que el navegador puede pedir. Un valor de Supabase ya es
// una URL pública; uno local es solo el nombre del archivo.
function imageUrl(filename) {
  if (!filename) return null;
  return filename.startsWith("http") ? filename : `/uploads/${filename}`;
}

// Guarda el archivo y devuelve lo que va a la columna: nombre en local, URL en Supabase.
// `prefix` nombra el archivo por su uso (product_, logo_, banner_) — no es decorativo: es
// lo único que permite reconocer para qué era un archivo suelto en el bucket.
async function saveImage(file, prefix = "img") {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

  if (isSupabase()) {
    return getSupabaseStorage().uploadImage(file.buffer, filename, file.mimetype);
  }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer);
  return filename;
}

// Borra el archivo anterior al reemplazarlo o al eliminar su registro. A diferencia de la
// versión que hay en productService, esta también borra en local: allá solo se limpiaba
// Supabase y cada reemplazo dejaba el archivo viejo ocupando el volumen para siempre.
//
// Nunca lanza. Un archivo que no se pudo borrar es basura en el disco; que eso tumbe el
// guardado del registro sería peor que la basura.
async function deleteImage(value) {
  if (!value) return;
  try {
    if (value.startsWith("http")) {
      if (isSupabase()) await getSupabaseStorage().deleteImage(value.split("/").pop());
      return;
    }
    // El valor viene de la base, pero se recorta a su nombre igual: basta un registro tocado
    // a mano para que un "../" apunte fuera de la carpeta de subidas.
    const p = path.join(UPLOADS_DIR, path.basename(value));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.error("[imageStorage] no se pudo borrar", value, err.message);
  }
}

module.exports = { imageUrl, saveImage, deleteImage, isSupabase };
