const multer = require("multer");
const path   = require("path");

const fileFilter = (_req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Solo se permiten imágenes (jpg, png, webp, gif)"), false);
};

// Usar memoria en vez de disco — compatible con Vercel y Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máx
});

module.exports = { upload };
