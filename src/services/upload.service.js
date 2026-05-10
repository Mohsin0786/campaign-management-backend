import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import UploadJob from '../models/uploadJob.model.js';
import { uploadQueue } from '../queues/upload.queue.js';
import { s3, UPLOAD_BUCKET } from '../config/s3.js';

const PRESIGN_EXPIRY = 600; // 10 minutes — browser must upload within this window

/**
 * STEP 1 — Frontend requests a presigned URL.
 * Backend generates a temporary S3 PUT URL and creates an UploadJob record.
 * The CSV file never touches the Express server.
 */
export async function generatePresignedUpload(fileName) {
  const job   = await UploadJob.create({ fileName, status: 'pending' });
  const s3Key = `uploads/${job._id}/${randomUUID()}.csv`;

  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:      UPLOAD_BUCKET,
      Key:         s3Key,
      ContentType: 'text/csv',
    }),
    { expiresIn: PRESIGN_EXPIRY },
  );

  // Save s3Key on job so worker can find the file
  await UploadJob.findByIdAndUpdate(job._id, { s3Key });

  return {
    jobId:        job._id,
    presignedUrl, // frontend uploads directly here — bypasses Express
    s3Key,
    expiresIn:    PRESIGN_EXPIRY,
  };
}

/**
 * STEP 2 — Frontend calls this after successfully uploading to S3.
 * Backend enqueues the BullMQ job. Worker will stream from S3 and process.
 */
export async function confirmUpload(jobId, s3Key) {
  const job = await UploadJob.findById(jobId);
  if (!job) throw Object.assign(new Error('Upload job not found'), { status: 404 });
  if (job.status !== 'pending')
    throw Object.assign(new Error(`Upload already ${job.status}`), { status: 409 });

  await uploadQueue.add(
    'process',
    { jobId: jobId.toString(), s3Key, fileName: job.fileName },
    { jobId: `upload-${jobId}` }, // dedupe key — can't queue same job twice
  );

  await UploadJob.findByIdAndUpdate(jobId, { status: 'queued' });
  return { queued: true, jobId };
}

/**
 * STEP 3 — Frontend polls this to track progress.
 */
export async function getUploadJob(jobId) {
  const job = await UploadJob.findById(jobId).lean();
  if (!job) throw Object.assign(new Error('Upload job not found'), { status: 404 });
  return job;
}

/**
 * Internal — called by worker to delete the S3 object after processing.
 */
export async function deleteS3Object(s3Key) {
  await s3.send(new DeleteObjectCommand({ Bucket: UPLOAD_BUCKET, Key: s3Key }));
}
