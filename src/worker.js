import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createCampaignWorker } from './workers/campaign.worker.js';
import { createUploadWorker }   from './workers/upload.worker.js';
import { createLogger } from './config/logger.js';

const logger = createLogger('worker');

await connectDB();

const campaignWorker = createCampaignWorker();
const uploadWorker   = createUploadWorker();

logger.info('Workers started');
logger.info('  ✓ campaign_send   (concurrency: 5)');
logger.info('  ✓ upload_process  (concurrency: 2)');

// Graceful shutdown — close both workers cleanly
const shutdown = async (signal) => {
  logger.info({ signal }, 'Closing workers');
  await Promise.all([
    campaignWorker.close(),
    uploadWorker.close(),
  ]);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
