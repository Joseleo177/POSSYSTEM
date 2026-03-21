const { validationResult } = require('express-validator');

// Middleware universal para abortar si hay errores de express-validator
const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, message: "Error de validación", errors: errors.array() });
  }
  next();
};

module.exports = { validateInput };
