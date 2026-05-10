import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import csv from 'csv-parser';
import Contact from '../models/contact.model.js';
import UploadJob from '../models/uploadJob.model.js';
import { redis } from '../config/redis.js';
import { s3, UPLOAD_BUCKET } from '../config/s3.js';
import { deleteS3Object } from '../services/upload.service.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger('upload.worker');

const BATCH_SIZE     = 500;
const MAX_ERRORS     = 50;
const KNOWN_FIELDS   = new Set(['name', 'email', 'phone', 'tags']);

export function createUploadWorker() {
  const worker = new Worker('upload_process', async (job) => {
    const { jobId, s3Key } = job.data;
    logger.info({ jobId, s3Key }, 'Processing upload job');

    await UploadJob.findByIdAndUpdate(jobId, { status: 'processing' });

    // Stream directly from S3 — never fully loaded into memory
    // Works across any number of worker instances on any machines
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: UPLOAD_BUCKET,
      Key:    s3Key,
    }));

    // s3Response.Body is a Node.js Readable stream
    const stream = s3Response.Body.pipe(csv());

    let batch        = [];
    let totalRows    = 0;
    let successCount = 0;
    let failureCount = 0;
    const errors     = [];

    for await (const row of stream) {
      totalRows++;
      const doc = _mapRow(row);

      if (!doc) {
        failureCount++;
        if (errors.length < MAX_ERRORS)
          errors.push(`Row ${totalRows}: missing required fields (name and email)`);
        continue;
      }

      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        const result  = await _flushBatch(batch);
        successCount += result.success;
        failureCount += result.failed;
        batch         = [];

        // Report progress back to BullMQ (visible in Bull dashboard)
        await job.updateProgress(Math.round((totalRows / Math.max(totalRows, 1)) * 100));
      }
    }

    // Flush remaining rows
    if (batch.length) {
      const result  = await _flushBatch(batch);
      successCount += result.success;
      failureCount += result.failed;
    }

    await UploadJob.findByIdAndUpdate(jobId, {
      status: 'done',
      totalRows,
      successCount,
      failureCount,
      errors,
    });

    // Cleanup S3 object immediately after processing
    // Rationale:
    // - Reduces storage costs (no need to store processed CSVs)
    // - Minimizes PII exposure (security best practice)
    // - Data is now in MongoDB (source of truth)
    // Alternative: Use S3 lifecycle policy or cron job if audit trail needed
    await deleteS3Object(s3Key).catch((err) =>
      logger.warn({ s3Key, err }, 'S3 cleanup failed'),
    );

    logger.info({ jobId, successCount, failureCount }, 'Upload job completed');

  }, {
    connection:  redis,
    concurrency: 2, // max 2 concurrent CSV uploads at any time
  });

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Upload job failed');
    if (job?.data?.jobId) {
      await UploadJob.findByIdAndUpdate(job.data.jobId, { status: 'failed' });
    }
    // Cleanup S3 even on failure
    if (job?.data?.s3Key) {
      await deleteS3Object(job.data.s3Key).catch(() => {});
    }
  });

  return worker;
}

async function _flushBatch(batch) {
  try {
    const res = await Contact.insertMany(batch, { ordered: false, rawResult: true });
    return { success: res.insertedCount, failed: batch.length - res.insertedCount };
  } catch (err) {
    // ordered:false throws on duplicates but still inserts non-duplicates
    const inserted = err.result?.nInserted ?? 0;
    return { success: inserted, failed: batch.length - inserted };
  }
}

function _mapRow(row) {
  const name  = row.name?.trim();
  const email = row.email?.trim().toLowerCase();
  
  // Both name and email are required
  if (!name || !email) return null;
  
  return {
    name,
    email,
    phone:    row.phone?.trim()               || undefined,
    tags:     row.tags
                ? row.tags.split(',').map(t => t.trim()).filter(Boolean)
                : [],
    metadata: Object.fromEntries(
      Object.entries(row).filter(([k, v]) => !KNOWN_FIELDS.has(k) && v),
    ),
  };
}
