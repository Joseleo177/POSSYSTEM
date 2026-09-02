'use strict';
const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const { addClient } = require('../services/sseService');
const env     = require('../config/envValidator');

const SECRET = process.env.JWT_SECRET;

// GET /api/events/stream?token=<jwt>
// EventSource no soporta headers custom → token por query param
router.get('/stream', (req, res) => {
  // Con SSE apagado (ver SSE_ENABLED) se corta aquí, antes de abrir nada. El 503 importa:
  // ante un status distinto de 200 EventSource da la conexión por fallida y NO reintenta,
  // así que una caja con el bundle viejo cargado pega una sola vez y se rinde. Si en vez
  // de eso abriéramos el stream y lo cerráramos, reconectaría en bucle cada 3 segundos.
  if (!env.SSE_ENABLED) {
    return res.status(503).json({ ok: false, message: 'SSE deshabilitado en este entorno' });
  }

  const token = req.query.token;
  if (!token) return res.status(401).json({ ok: false, message: 'Token requerido' });

  let decoded;
  try { decoded = jwt.verify(token, SECRET); }
  catch { return res.status(401).json({ ok: false, message: 'Token inválido' }); }

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desactiva buffering en nginx
  res.flushHeaders();

  // Mensaje inicial de conexión
  res.write('event: connected\ndata: {}\n\n');

  // Heartbeat cada 25s — evita que nginx/proxies cierren la conexión idle
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  res.on('close', () => clearInterval(heartbeat));

  addClient(decoded.company_id ?? 0, res);
});

module.exports = router;
