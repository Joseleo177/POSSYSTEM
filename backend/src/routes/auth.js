const router = require("express").Router();
const { body } = require('express-validator');
const ctrl   = require("../controllers/auth");
const { auth } = require("../middleware/auth");
const { validateInput } = require('../middleware/validator');

router.post("/login", [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validateInput
], ctrl.login);
router.post("/refresh", ctrl.refresh);
router.get("/me",               auth, ctrl.me);
// La regla de la contraseña nueva la aplica el controlador (utils/passwordPolicy.js). Antes este
// validador pedía `currentPassword` y el controlador leía `current_password`: ninguna petición
// pasaba las dos cosas y el endpoint nunca funcionó.
router.post("/change-password", [
  auth,
  body('current_password').notEmpty().withMessage('Escribe tu contraseña actual'),
  body('new_password').notEmpty().withMessage('Escribe la contraseña nueva'),
  validateInput
], ctrl.changePassword);

module.exports = router;
