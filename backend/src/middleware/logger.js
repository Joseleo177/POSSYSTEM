const { createLogger, format, transports } = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const loggerTransports = [
  new transports.Console({
    format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), logFormat),
  }),
];

if (process.env.NODE_ENV !== "production") {
  loggerTransports.push(
    new transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: loggerTransports,
});

module.exports = logger;
