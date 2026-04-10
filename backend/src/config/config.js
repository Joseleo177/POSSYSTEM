require('dotenv').config();

const pool = {
  max: 10,
  min: 2,
  acquire: 30000,
  idle: 10000,
};

module.exports = {
  development: {
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
