const router = require("express").Router();
const ctrl   = require("../controllers/backup");
const { auth, superuser } = require("../middleware/auth");

// Superusuario, no `backup.manage`. El respaldo es un pg_dump de la base entera, así que
// un archivo contiene las ventas, los clientes y los correlativos fiscales de TODAS las
// empresas. Con un permiso granular, el admin de una empresa podía descargarse los datos
// de las demás — o borrar las copias de todo el mundo.
router.get("/",                   auth, superuser, ctrl.listBackups);
router.post("/trigger",           auth, superuser, ctrl.triggerBackup);
router.get("/download/:filename", auth, superuser, ctrl.downloadBackup);
router.delete("/:filename",       auth, superuser, ctrl.deleteBackup);

module.exports = router;
