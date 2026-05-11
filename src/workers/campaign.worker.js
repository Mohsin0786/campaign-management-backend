import { Worker } from 'bullmq';
import Campaign from '../models/campaign.model.js';
import Contact from '../models/contact.model.js';
import Message from '../models/message.model.js';
import { redis } from '../config/redis.js';
import { buildAudienceFilter } from '../services/contact.service.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('campaign.worker');

const BATCH_SIZE   = 200;
const FAILURE_RATE = 0.10; // 10% simulated failure
const BATCH_DELAY  = 100;  // ms artificial delay per batch
const LOCK_TTL     = 300;  // seconds

// Rate limiting: simulate real-world messaging provider constraints
// Example: Twilio allows ~100 SMS/second, SendGrid ~1000 emails/second
const RATE_LIMIT = {
  maxMessagesPerSecond: 500,  // Max 500 messages per second
  maxMessagesPerMinute: 20000, // Max 20k messages per minute
};

export function createCampaignWorker() {
  const worker = new Worker('campaign_send', async (job) => {
    const { campaignId } = job.data;
    logger.info({ campaignId }, 'Processing campaign');

    // Distributed lock — prevents two worker instances processing same campaign
    const lockKey = `campaign:lock:${campaignId}`;
    const locked  = await redis.set(lockKey, '1', 'NX', 'EX', LOCK_TTL);
    if (!locked) {
      logger.warn({ campaignId }, 'Campaign already locked — skipping');
      return;
    }

    try {
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');
      if (campaign.status !== 'running') {
        logger.info({ campaignId, status: campaign.status }, 'Campaign not running — skipping');
        return;
      }

      const filter = buildAudienceFilter(campaign.audienceFilter);

      // Cursor streaming — never loads all contacts into memory at once
      const cursor = Contact.find(filter).select('_id').lean().cursor();
      let batch     = [];
      let processed = 0;
      let messagesThisSecond = 0;
      let messagesThisMinute = 0;
      let secondStart = Date.now();
      let minuteStart = Date.now();

      for await (const contact of cursor) {
        batch.push(contact._id);

        if (batch.length >= BATCH_SIZE) {
          // Rate limiting: enforce max messages per second/minute
          const now = Date.now();
          
          // Reset counters if time window passed
          if (now - secondStart >= 1000) {
            messagesThisSecond = 0;
            secondStart = now;
          }
          if (now - minuteStart >= 60000) {
            messagesThisMinute = 0;
            minuteStart = now;
          }

          // Check if we've hit rate limits
          if (messagesThisSecond + batch.length > RATE_LIMIT.maxMessagesPerSecond) {
            const waitTime = 1000 - (now - secondStart);
            logger.debug({ campaignId, waitTime }, 'Rate limit: waiting for next second');
            await new Promise(r => setTimeout(r, waitTime));
            messagesThisSecond = 0;
            secondStart = Date.now();
          }

          if (messagesThisMinute + batch.length > RATE_LIMIT.maxMessagesPerMinute) {
            const waitTime = 60000 - (now - minuteStart);
            logger.warn({ campaignId, waitTime }, 'Rate limit: waiting for next minute');
            await new Promise(r => setTimeout(r, waitTime));
            messagesThisMinute = 0;
            minuteStart = Date.now();
          }

          await _processBatch(campaignId, batch);
          processed += batch.length;
          messagesThisSecond += batch.length;
          messagesThisMinute += batch.length;
          batch = [];
          
          await job.updateProgress(
            Math.round((processed / campaign.totalCount) * 100),
          );
        }
      }

      if (batch.length) await _processBatch(campaignId, batch);

      await Campaign.findByIdAndUpdate(campaignId, {
        status:      'completed',
        completedAt: new Date(),
      });

      await redis.del(`campaign:stats:${campaignId}`);
      logger.info({ campaignId }, 'Campaign completed');

    } catch (err) {
      logger.error({ campaignId, err }, 'Campaign processing failed');
      await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });
      throw err; // rethrow so BullMQ retries
    } finally {
      await redis.del(lockKey);
    }

  }, {
    connection:  redis,
    concurrency: 5,
    limiter:     { max: 100, duration: 1000 },
  });

  worker.on('completed', (job) =>
    logger.info({ jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'Job failed'));

  return worker;
}

async function _processBatch(campaignId, contactIds) {
  // Step 1: insert messages as queued (idempotent via unique index)
  const docs = contactIds.map(contactId => ({ campaignId, contactId, status: 'queued' }));
  await Message.insertMany(docs, { ordered: false }).catch(() => {});

  // Step 2: artificial delay simulating delivery latency
  await new Promise(r => setTimeout(r, BATCH_DELAY));

  // Step 3: simulate sent/failed outcomes
  let sentInBatch   = 0;
  let failedInBatch = 0;

  const bulkOps = contactIds.map(contactId => {
    const failed = Math.random() < FAILURE_RATE;
    if (failed) failedInBatch++; else sentInBatch++;

    return {
      updateOne: {
        filter: { campaignId, contactId },
        update: {
          $set: {
            status:      failed ? 'failed' : 'sent',
            sentAt:      failed ? undefined : new Date(),
            errorReason: failed ? 'Simulated delivery failure' : undefined,
          },
        },
      },
    };
  });

  await Message.bulkWrite(bulkOps, { ordered: false });

  // Step 4: atomic counter update on campaign document
  await Campaign.findByIdAndUpdate(campaignId, {
    $inc: {
      sentCount:    sentInBatch,
      failedCount:  failedInBatch,
      pendingCount: -contactIds.length,
    },
  });

  // Step 5: bust Redis stats cache — next poll gets fresh data
  await redis.del(`campaign:stats:${campaignId}`);
}
