'use strict';

// Store compartido de rate limiting para serverless (Vercel).
//
// El MemoryStore que trae express-rate-limit guarda los contadores en la memoria de cada
// proceso. En Vercel cada petición puede caer en una instancia distinta, así que el contador
// de una IP se reinicia con cada cold start: el tope de 50 intentos de login por 15 minutos
// nunca llega a alcanzarse y la fuerza bruta queda destapada. Este store persiste los
// contadores en la misma base (Supabase/Postgres) que usa el sistema, de modo que todas las
// instancias comparten el mismo número.
//
// Es solo para endpoints puntuales (auth). No se usa en el limiter global: ahí un viaje a la
// base por cada request añadiría latencia y carga sin ganancia real de seguridad. El upsert es
// atómico: el lock de fila de Postgres serializa los incrementos concurrentes de una misma key,
// y el reset del período se resuelve dentro del mismo statement comparando reset_at con NOW().

const { QueryTypes } = require("sequelize");

let _sequelize = null;
const sequelize = () => {
  if (!_sequelize) _sequelize = require("../models").sequelize;
  return _sequelize;
};

class PostgresStore {
  constructor(prefix = "erl:") {
    // `localKeys = false` le avisa a express-rate-limit que los keys viven en un store
    // compartido entre instancias, no en la memoria de este proceso.
    this.localKeys = false;
    this.prefix = prefix;
    this.windowMs = 60_000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const secs = Math.ceil(this.windowMs / 1000);
    const rows = await sequelize().query(
      `INSERT INTO rate_limits (key, hits, reset_at)
       VALUES (:key, 1, NOW() + make_interval(secs => :secs::double precision))
       ON CONFLICT (key) DO UPDATE SET
         hits     = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.hits + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN NOW() + make_interval(secs => :secs::double precision) ELSE rate_limits.reset_at END
       RETURNING hits, reset_at`,
      {
        replacements: { key: `${this.prefix}${key}`, secs },
        type: QueryTypes.SELECT,
      }
    );
    const row = rows[0];
    return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
  }

  async decrement(key) {
    await sequelize().query(
      `UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = :key`,
      { replacements: { key: `${this.prefix}${key}` } }
    );
  }

  async resetKey(key) {
    await sequelize().query(
      `DELETE FROM rate_limits WHERE key = :key`,
      { replacements: { key: `${this.prefix}${key}` } }
    );
  }

  async resetAll() {
    await sequelize().query(
      `DELETE FROM rate_limits WHERE key LIKE :prefix`,
      { replacements: { prefix: `${this.prefix}%` } }
    );
  }
}

module.exports = { PostgresStore };
