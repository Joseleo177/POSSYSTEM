const router = require("express").Router();
const ctrl   = require("../controllers/employees");
const { auth, permit } = require("../middleware/auth");

// `employees` es un permiso opcional que el admin activa por rol: habilita gestionar
// usuarios PERO solo los de la propia sucursal, y nunca administradores. El controlador es
// quien impone ese límite; acá solo se abre la puerta.
//
// Editar los permisos de un rol sigue siendo exclusivo del admin: es la llave que reparte
// todas las demás.
router.get("/roles",       auth,                                ctrl.getRoles);
router.put("/roles/:id",   auth, permit("admin"),               ctrl.updateRole);
router.get("/",            auth, permit("admin", "employees"),  ctrl.getAll);
router.post("/",           auth, permit("admin", "employees"),  ctrl.create);
router.put("/:id",         auth, permit("admin", "employees"),  ctrl.update);
router.delete("/:id",      auth, permit("admin", "employees"),  ctrl.remove);

module.exports = router;
