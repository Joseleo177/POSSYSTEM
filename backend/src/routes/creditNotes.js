const router = require("express").Router();
const ctrl   = require("../controllers/creditNotes");
const { auth, permit } = require("../middleware/auth");

router.get("/", auth, permit("accounting.view"), ctrl.getAll);
// Anular mueve inventario y saldos, así que pide el permiso de anular ventas, no el de
// ver contabilidad con el que se lista esta pantalla.
router.put("/:id/annul", auth, permit("sales.void"), ctrl.annul);

module.exports = router;
