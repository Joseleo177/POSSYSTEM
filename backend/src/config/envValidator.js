const Joi = require('joi');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(4000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('12h'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  CORS_ORIGIN: Joi.string().default('*'),
  // El stream SSE sostiene una conexión abierta por caja. En un servidor propio no cuesta
  // nada; en serverless cada conexión mantiene viva una función hasta su tope de duración
  // y el navegador reconecta en bucle, así que ahí va apagado. Apagado por defecto: sólo
  // se enciende donde hay un proceso permanente que lo sostenga (Docker).
  SSE_ENABLED: Joi.boolean().default(false)
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  console.error(`❌ Error de Configuración de Entorno: ${error.message}`);
  process.exit(1);
}

module.exports = envVars;
