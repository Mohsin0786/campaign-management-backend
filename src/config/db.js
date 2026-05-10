import mongoose from 'mongoose';
import { createLogger } from './logger.js';

const logger = createLogger('db');

export const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info({ host: mongoose.connection.host }, 'MongoDB connected');
};

export const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected');
};
