import { S3Client } from '@aws-sdk/client-s3';

// LocalStack support for local development
const isLocal = process.env.NODE_ENV === 'development' && process.env.AWS_ENDPOINT;

export const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  ...(isLocal && {
    endpoint:       process.env.AWS_ENDPOINT, // e.g. http://localhost:4566
    forcePathStyle: true,                     // required for LocalStack
  }),
});

export const UPLOAD_BUCKET = process.env.S3_BUCKET || 'campaign-uploads';
