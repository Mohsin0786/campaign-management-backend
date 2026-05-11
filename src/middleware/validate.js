import { z } from 'zod';
import mongoose from 'mongoose';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error:   'Validation failed',
      details: result.error.flatten().fieldErrors,
    });
  }
  req.body = result.data;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({
      error:   'Invalid parameters',
      details: result.error.flatten().fieldErrors,
    });
  }
  req.params = result.data;
  next();
};

export const schemas = {
  createCampaign: z.object({
    name:            z.string().min(1, 'Name required').max(200),
    messageTemplate: z.string().min(1, 'Message template required'),
    audienceFilter:  z.object({
      tags:          z.array(z.string()).optional(),
      createdAfter:  z.string().optional(),
      createdBefore: z.string().optional(),
    }).optional().default({}),
  }),

  confirmUpload: z.object({
    jobId: z.string().min(1),
    s3Key: z.string().min(1),
  }),

  mongoId: z.object({
    id: z.string().refine(
      (val) => mongoose.Types.ObjectId.isValid(val),
      { message: 'Invalid MongoDB ObjectId' }
    ),
  }),
};
