require('dotenv').config();

const pool = {
  max: 10,
  min: 2,
  acquire: 30000,
  idle: 10000,
};

// Zona horaria de operación. Sequelize emite SET TIME ZONE en cada conexión,
// de modo que DATE(created_at), los literales de fecha y NOW() se resuelven
// en hora local y no en UTC. Venezuela es UTC-4 fijo (sin horario de verano).
const timezone = process.env.DB_TIMEZONE || 'America/Caracas';

module.exports = {
  development: {
    timezone,
    username: process.env.DB_USER || 'posuser',
    password: process.env.DB_PASSWORD || 'pospassword',
    database: process.env.DB_NAME || 'posdb',
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool,
    ...(process.env.DB_SSL === 'true' && {
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
      },
    }),
  },
  test: {
    timezone,
    username: process.env.DB_USER || 'posuser',
    password: process.env.DB_PASSWORD || 'pospassword',
    database: process.env.DB_NAME || 'posdb',
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool,
  },
  production: {
    timezone,
    username: process.env.DB_USER || 'posuser',
    password: process.env.DB_PASSWORD || 'pospassword',
    database: process.env.DB_NAME || 'posdb',
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: { max: 20, min: 5, acquire: 30000, idle: 10000 },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
