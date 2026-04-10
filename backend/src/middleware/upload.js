const multer = require("multer");
const path   = require("path");

const fileFilter = (_req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Solo se permiten imágenes (jpg, png, webp, gif)"), false);
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

const upload = multer({
  storage: multer.memoryStorage(), // siempre memory; decidimos destino en el controller
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máx
});

module.exports = { upload };
