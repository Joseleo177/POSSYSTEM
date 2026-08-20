const router = require("express").Router();
const ctrl   = require("../controllers/employees");
const { auth, permit } = require("../middleware/auth");

// `employees` es un permiso opcional que el admin activa por rol: habilita gestionar
// usuarios PERO solo los de la propia sucursal, y nunca administradores. El controlador es
// quien impone ese límite; acá solo se abre la puerta.
//
// Editar los permisos de un rol sigue siendo exclusivo del admin: es la llave que reparte
// todas las demás.
router.get("/permissions", auth, ctrl.getPermissionCatalog);
router.get("/roles",       auth,                                ctrl.getRoles);
router.put("/roles/:id",   auth, permit("admin"),               ctrl.updateRole);
router.get("/",            auth, permit("employees.view"),  ctrl.getAll);
router.post("/",           auth, permit("employees.create"),  ctrl.create);
router.put("/:id",         auth, permit("employees.edit"),  ctrl.update);
router.delete("/:id",      auth, permit("employees.delete"),  ctrl.remove);

module.exports = router;
