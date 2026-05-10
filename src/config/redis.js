import { Redis } from 'ioredis';
import { createLogger } from './logger.js';

const logger = createLogger('redis');

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error',   (err) => logger.error({ err }, 'Redis error'));
