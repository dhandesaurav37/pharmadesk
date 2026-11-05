import pino, { LoggerOptions } from 'pino';
import { env } from '../config/env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-firebase-appcheck"]',
  'req.body.password',
  'req.body.otp',
  'req.body.token',
  'req.body.idToken',
  'req.body.refreshToken',
  'req.body.secret',
  'req.body.customerPhone',
  'req.body.customerName',
  'req.body.doctorName',
  'req.body.doctorRegNumber',
  'req.body.prescriptionDocUrl',
  'req.body.cardNumber',
  'req.body.cvv',
  'req.body.pin',
  '*.password',
  '*.token',
  '*.otp',
];

const pinoOptions: LoggerOptions = {
  name: 'pharmadesk-backend',
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { severity: label.toUpperCase(), level: label };
    },
  },
};

// Use pino-pretty stream in development if available, standard JSON stream in production/test
export const logger =
  env.NODE_ENV === 'development'
    ? pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      })
    : pino(pinoOptions);

export default logger;
