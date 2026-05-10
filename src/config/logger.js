import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Pretty print in development, JSON in production
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize:       true,
      translateTime:  'HH:MM:ss',
      ignore:         'pid,hostname',
      singleLine:     false,
    },
  } : undefined,

  // Base fields included in every log
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

// Child loggers for different modules
export const createLogger = (module) => logger.child({ module });
