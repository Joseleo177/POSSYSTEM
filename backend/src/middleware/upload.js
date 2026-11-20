const multer = require("multer");
const path   = require("path");
const { tenantStorage } = require("../utils/tenantStorage");

const fileFilter = (_req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".jfif"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Solo se permiten imágenes (jpg, png, webp, gif, jfif)"), false);
};

// Se evalúa en cada request, no al cargar el módulo
const getStorage = () => {
  if (process.env.SUPABASE_URL) return multer.memoryStorage();
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../../uploads")),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `product_${Date.now()}${ext}`);
    }
  });
};

const multerUpload = multer({
  storage: multer.memoryStorage(), // siempre memory; decidimos destino en el controller
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máx
});

/**
 * multer lee el archivo con callbacks de stream, y en una petición multipart el `next()` que
 * llama ya no corre dentro del AsyncLocalStorage que abrió `auth`: el filtro multi-empresa
 * (models/index.js) se apaga y `Product.findByPk(id)` encuentra productos de CUALQUIER empresa.
 * Pasó: un admin podía editar productos ajenos mandando el formulario con foto (auditoría
 * 20-11-2026). Con JSON no se notaba porque multer llama a `next()` sin leer nada.
 *
 * Por eso cada middleware de multer se envuelve: se guarda el contexto antes y se vuelve a
 * entrar en él al seguir. Así ninguna ruta con archivo depende de pasar company_id a mano.
 */
const conEmpresa = (middleware) => (req, res, next) => {
  const store = tenantStorage.getStore();
  middleware(req, res, (err) => (store ? tenantStorage.run(store, () => next(err)) : next(err)));
};

const upload = {
  single: (...a) => conEmpresa(multerUpload.single(...a)),
  array:  (...a) => conEmpresa(multerUpload.array(...a)),
  fields: (...a) => conEmpresa(multerUpload.fields(...a)),
  none:   (...a) => conEmpresa(multerUpload.none(...a)),
  any:    (...a) => conEmpresa(multerUpload.any(...a)),
};

module.exports = { upload };
