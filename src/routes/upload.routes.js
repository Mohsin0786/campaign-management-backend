import { Router } from 'express';
import { validate, schemas } from '../middleware/validate.js';
import {
  generatePresignedUpload,
  confirmUpload,
  getUploadJob,
} from '../services/upload.service.js';

const router = Router();

/**
 * STEP 1 — Frontend requests a presigned S3 URL
 * GET /api/uploads/presign?fileName=contacts.csv
 *
 * Response: { jobId, presignedUrl, s3Key, expiresIn }
 * Frontend then PUTs the file directly to presignedUrl (bypasses Express)
 */
router.get('/presign', async (req, res, next) => {
  try {
    const { fileName } = req.query;
    if (!fileName)
      return res.status(400).json({ error: 'fileName query param required' });
    if (!fileName.endsWith('.csv'))
      return res.status(400).json({ error: 'Only .csv files are accepted' });

    const result = await generatePresignedUpload(fileName);
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * STEP 2 — Frontend confirms upload completed in S3, triggers processing
 * POST /api/uploads/confirm
 * Body: { jobId, s3Key }
 *
 * Enqueues BullMQ job. Worker will stream from S3 and process the CSV.
 */
router.post('/confirm', validate(schemas.confirmUpload), async (req, res, next) => {
  try {
    const { jobId, s3Key } = req.body;
    const result = await confirmUpload(jobId, s3Key);
    res.status(202).json(result);
  } catch (err) { next(err); }
});

/**
 * STEP 3 — Frontend polls for progress
 * GET /api/uploads/:id
 *
 * Response: UploadJob { status, totalRows, successCount, failureCount, errors }
 */
router.get('/:id', async (req, res, next) => {
  try {
    const job = await getUploadJob(req.params.id);
    res.json(job);
  } catch (err) { next(err); }
});

export default router;
