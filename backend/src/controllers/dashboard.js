const { getDashboard } = require("../services/dashboard");

const wrap = (fn, status = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    res.status(status).json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  getDashboard: wrap(req => getDashboard({
    company_id:  req.employee?.company_id ?? null,
    isSuperuser: !!req.is_superuser,
  })),
};
