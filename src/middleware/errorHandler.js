import { createLogger } from '../config/logger.js';

const logger = createLogger('errorHandler');

export function errorHandler(err, req, res, next) {
  logger.error({
    err,
    method: req.method,
    url:    req.url,
    body:   req.body,
  }, err.message);

  if (err.name === 'ValidationError')
    return res.status(400).json({ error: 'Validation error', details: err.message });

  if (err.code === 11000)
    return res.status(409).json({ error: 'Duplicate key', details: err.keyValue });

  if (err.name === 'CastError')
    return res.status(400).json({ error: 'Invalid ID format' });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
