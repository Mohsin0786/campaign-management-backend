import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

export const uploadQueue = new Queue('upload_process', {
  connection: redis,
  defaultJobOptions: {
    attempts:        2,
    backoff:         { type: 'exponential', delay: 3000 },
    removeOnComplete: 50,
    removeOnFail:    100,
  },
});
