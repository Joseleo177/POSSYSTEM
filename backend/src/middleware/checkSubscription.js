const { Company } = require("../models");

/**
 * Middleware to check if the company's subscription is active.
 * Should be placed AFTER auth middleware.
 * Superusers bypass this check.
 */
const checkSubscription = async (req, res, next) => {
  // Superusers always pass
  if (req.is_superuser) return next();

  const company_id = req.employee?.company_id;
  if (!company_id) return next(); // No company context (shouldn't happen after auth)

  try {
    const company = await Company.findByPk(company_id, {
      attributes: ['id', 'active', 'subscription_status', 'expires_at', 'max_users']
    });

    if (!company) {
      return res.status(403).json({ ok: false, message: "Empresa no encontrada" });
    }

    if (!company.active) {
      return res.status(403).json({ ok: false, message: "Tu empresa ha sido desactivada. Contacta al administrador." });
    }

    if (company.subscription_status === 'Suspendida') {
      return res.status(403).json({ ok: false, message: "La suscripción de tu empresa está suspendida. Contacta al administrador." });
    }

    if (company.expires_at && new Date(company.expires_at) < new Date()) {
      return res.status(403).json({ ok: false, message: "La suscripción de tu empresa ha expirado. Renueva tu plan para continuar." });
    }

    next();
  } catch (err) {
    console.error("Subscription check error:", err.message);
    next(); // Fail open to avoid blocking on DB errors
  }
};

module.exports = checkSubscription;
