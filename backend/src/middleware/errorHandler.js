const logger = require("./logger");

/**
 * Centralized error handling middleware.
 * Catches all errors forwarded via next(err) and returns consistent JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  // Log the error with context
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });

  // Sequelize unique constraint
  if (err.name === "SequelizeUniqueConstraintError") {
    const field = err.errors?.[0]?.path || "campo";
    return res.status(400).json({ ok: false, message: `Ya existe un registro con ese ${field}` });
  }

  // Sequelize validation
  if (err.name === "SequelizeValidationError") {
    const msg = err.errors.map((e) => e.message).join(", ");
    return res.status(400).json({ ok: false, message: msg });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ ok: false, message: "Token inválido o expirado" });
  }

  // Business logic errors (thrown manually)
  if (err.isOperational) {
    return res.status(err.status || 400).json({ ok: false, message: err.message });
  }

  // Known 4xx patterns from existing controllers
  if (/insuficiente|no encontrado|requerido|inactiv/i.test(err.message)) {
    return res.status(400).json({ ok: false, message: err.message });
  }

  // Unknown / server error
  const isDev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    ok: false,
    message: isDev ? err.message : "Error interno del servidor",
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
