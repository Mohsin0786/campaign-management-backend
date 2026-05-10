import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import contactRoutes  from './routes/contact.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import uploadRoutes   from './routes/upload.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' })); // no large payloads — files go direct to S3

// Health check
app.get('/health', (req, res) =>
  res.json({ status: 'ok', ts: new Date() }),
);

app.use('/api/contacts',  contactRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/uploads',   uploadRoutes);

// 404 handler
app.use((req, res) =>
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }),
);

// Global error handler
app.use(errorHandler);

export default app;
