'use strict';
const cashSessionsService = require("../services/cashSessions");

// ── POST /api/cash-sessions/open ──────────────────────────────
// body: { employee_id, warehouse_id, journals: [{journal_id, opening_amount}] }
const openSession = async (req, res) => {
  try {
    const full = await cashSessionsService.openSession(req.body);
    res.status(201).json({ ok: true, data: full });
  } catch (err) {
    const status = err.status || (/requeridos|Debes incluir/i.test(err.message) ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message, ...(err.session ? { session: err.session } : {}) });
  }
};

// ── GET /api/cash-sessions/current?employee_id=&warehouse_id= ─
const getCurrent = async (req, res) => {
  try {
    const session = await cashSessionsService.getCurrentSession(req.query);
    res.json({ ok: true, data: session || null });
  } catch (err) {
    const status = /requeridos/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// ── GET /api/cash-sessions/:id/summary ───────────────────────
const getSummary = async (req, res) => {
  try {
    const data = await cashSessionsService.getSessionSummary(req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// ── POST /api/cash-sessions/:id/close ────────────────────────
// body: { journals: [{journal_id, closing_amount}], notes }
const closeSession = async (req, res) => {
  try {
    const updated = await cashSessionsService.closeSession(req.params.id, req.body);
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// ── GET /api/cash-sessions/history ───────────────────────────
const getHistory = async (req, res) => {
  try {
    const sessions = await cashSessionsService.getHistory(req.query);
    res.json({ ok: true, data: sessions });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { openSession, getCurrent, getSummary, closeSession, getHistory };
