import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';
import { createLogger } from './config/logger.js';

const logger = createLogger('server');
const PORT = process.env.PORT || 3000;

await connectDB();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `API server running on http://localhost:${PORT}`);
});

// Graceful shutdown — handles SIGTERM from Railway/Render/Docker
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(async () => {
    await mongoose.connection.close();
    logger.info('Server and DB connections closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000); // force kill after 10s
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
