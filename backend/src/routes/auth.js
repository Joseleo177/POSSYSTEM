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
router.post("/change-password", [
  auth,
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validateInput
], ctrl.changePassword);

module.exports = router;
