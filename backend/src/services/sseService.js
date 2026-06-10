'use strict';

// Map<company_id, Set<res>> — clientes SSE agrupados por empresa
const clients = new Map();

function addClient(companyId, res) {
  if (!clients.has(companyId)) clients.set(companyId, new Set());
  clients.get(companyId).add(res);
  res.on('close', () => {
    clients.get(companyId)?.delete(res);
  });
}

function broadcast(companyId, event, data = {}) {
  const set = clients.get(companyId);
  if (!set?.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch { set.delete(res); }
  }
}

module.exports = { addClient, broadcast };
