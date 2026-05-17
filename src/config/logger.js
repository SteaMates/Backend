/**
 * Nombre del fichero: logger.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Función: createLogger
 * Descripción: Crea y exporta la instancia principal de Winston para toda la aplicación.
 * En desarrollo usa formato colorizado legible; en producción usa JSON estructurado.
 * Siempre persiste errores en logs/error.log y todos los niveles en logs/combined.log.
 */
const logger = createLogger({
  level: isDev ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
  ),
  transports: [
    new transports.Console({
      format: isDev
        ? format.combine(
            format.colorize({ all: true }),
            format.printf(({ timestamp, level, message, stack }) =>
              stack
                ? `${timestamp} [${level}] ${message}\n${stack}`
                : `${timestamp} [${level}] ${message}`,
            ),
          )
        : format.json(),
    }),
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: format.json(),
    }),
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: format.json(),
    }),
  ],
});

/**
 * Función: httpLogger
 * Descripción: Middleware de Express que registra cada petición HTTP con método,
 * ruta, código de estado y tiempo de respuesta usando el logger de Winston.
 */
export function httpLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

export default logger;
