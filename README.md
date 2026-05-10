# Campaign Management System — Backend

## Stack
- **Node.js + Express** — API server
- **MongoDB + Mongoose** — primary database
- **Redis + BullMQ** — job queues (uploads + campaigns)
- **AWS S3** — CSV file storage (presigned URL upload)
- **Zod** — request validation

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or Redis Cloud)
- AWS S3 bucket **OR** LocalStack for local dev

### Install
```bash
npm install
cp .env.example .env
# Edit .env with your credentials
```

### Local dev with LocalStack (no real AWS needed)
```bash
# Run LocalStack via Docker
docker run -p 4566:4566 localstack/localstack

# Create bucket in LocalStack
aws --endpoint-url=http://localhost:4566 s3 mb s3://campaign-uploads

# Set in .env:
# AWS_ENDPOINT=http://localhost:4566
# AWS_ACCESS_KEY_ID=test
# AWS_SECRET_ACCESS_KEY=test
# S3_BUCKET=campaign-uploads
```

### Run (two separate processes)
```bash
# Terminal 1: API server
npm run dev

# Terminal 2: Worker process (upload + campaign workers)
npm run dev:worker
```

### Seed 100k contacts for testing
```bash
npm run seed
```

### Run query explain plans (after seeding)
```bash
npm run explain
```

---

## CSV Upload Flow (Presigned URL)

The CSV file **never passes through the Express server**. This keeps the API fast regardless of file size or concurrent uploads.

```
1. Frontend → GET /api/uploads/presign?fileName=contacts.csv
   ← { jobId, presignedUrl, s3Key, expiresIn: 600 }

2. Frontend → PUT presignedUrl (direct to S3, bypasses Express)
   ← 200 OK from S3

3. Frontend → POST /api/uploads/confirm { jobId, s3Key }
   ← { queued: true, jobId }

4. Frontend → GET /api/uploads/:jobId  (poll every 2s)
   ← { status, totalRows, successCount, failureCount, errors }
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/uploads/presign?fileName= | Get presigned S3 URL |
| POST | /api/uploads/confirm | Confirm upload, enqueue processing |
| GET | /api/uploads/:id | Poll upload job progress |
| GET | /api/contacts | List contacts (search, filter, cursor pagination) |
| POST | /api/campaigns | Create campaign |
| GET | /api/campaigns | List campaigns |
| GET | /api/campaigns/:id | Campaign detail + stats (Redis cached 5s) |
| POST | /api/campaigns/:id/start | Start campaign execution |
| GET | /api/campaigns/:id/analytics | Messages sent over time |

---

## Architecture Decisions

### Presigned S3 upload
File upload goes directly from browser to S3. Express only issues the signed URL and enqueues the processing job. Zero file bytes flow through the API server — it stays fast for all other requests regardless of upload load.

### Cursor-based pagination
All list endpoints use `_id`-based cursor pagination. `skip(10000)` scans 10k docs to discard them — cursor pagination jumps directly using the `_id` index. O(log n) at any page depth.

### Denormalized counters
`sentCount`, `failedCount`, `pendingCount` are stored on the Campaign document and updated via atomic `$inc`. Dashboard reads are O(1) — no aggregation needed. Trade-off: counters can drift on worker crash; mitigated by the idempotency index on messages.

### Idempotent message inserts
Unique index `{ campaignId, contactId }` on messages. `insertMany` with `ordered: false` silently skips duplicates. Worker retries never double-send.

### Distributed locking
Redis `SET NX` with TTL prevents two worker instances processing the same campaign simultaneously.

### Separate worker process
API (`src/server.js`) and workers (`src/worker.js`) are separate Node processes. API stays responsive under heavy processing load. Scale them independently.

---

## Scalability

| Scale | Contacts | Behavior |
|-------|----------|----------|
| 100k | Single upload | All queries indexed, sub-10ms |
| 1M | Multiple campaigns | Cursor streaming keeps worker memory flat |
| 10M | High concurrency | Shard messages on campaignId; move analytics to read replica |
