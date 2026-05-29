const fs   = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "../../backups");

const ensureDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const safeFilename = (filename) => /^posdb_\d{8}_\d{6}\.sql\.gz$/.test(filename);

exports.listBackups = (req, res) => {
  try {
    ensureDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => safeFilename(f))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stats.size, created_at: stats.mtime };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ ok: true, data: files });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.triggerBackup = (req, res) => {
  try {
    ensureDir();
    fs.writeFileSync(path.join(BACKUP_DIR, ".trigger"), new Date().toISOString());
    res.json({ ok: true, message: "Respaldo iniciado. Estará disponible en unos segundos." });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.downloadBackup = (req, res) => {
  const { filename } = req.params;
  if (!safeFilename(filename))
    return res.status(400).json({ ok: false, message: "Nombre de archivo inválido" });

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" });

  res.download(filePath, filename);
};

exports.deleteBackup = (req, res) => {
  const { filename } = req.params;
  if (!safeFilename(filename))
    return res.status(400).json({ ok: false, message: "Nombre de archivo inválido" });

  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" });

  fs.unlinkSync(filePath);
  res.json({ ok: true, message: "Respaldo eliminado" });
};
