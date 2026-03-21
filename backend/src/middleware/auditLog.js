const logger = require("./logger");

/**
 * Audit log middleware — records mutating operations (POST/PUT/DELETE)
 * to the audit_logs table in the database.
 * Attach AFTER auth middleware on routes you want to audit.
 */
const auditLog = (req, res, next) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutating.includes(req.method)) return next();

  // Intercept the response to capture the status code
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Fire-and-forget: don't block the response
    if (req.employee) {
      setImmediate(async () => {
        try {
          const { sequelize } = require("../models");
          await sequelize.query(
            `INSERT INTO audit_logs (employee_id, employee_name, method, path, ip, status_code)
             VALUES (:empId, :empName, :method, :path, :ip, :status)`,
            {
              replacements: {
                empId:   req.employee.id,
                empName: req.employee.full_name || req.employee.username,
                method:  req.method,
                path:    req.path,
                ip:      req.ip || req.headers["x-forwarded-for"] || "unknown",
                status:  res.statusCode,
              },
              type: sequelize.QueryTypes.INSERT,
            }
          );
        } catch (e) {
          logger.warn("Audit log insert failed: " + e.message);
        }
      });
    }
    return originalJson(body);
  };

  next();
};

module.exports = auditLog;
