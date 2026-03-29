import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { messagesRouter } from './routes/messages';
import { webhooksRouter } from './routes/webhooks';
import { accountsRouter } from './routes/accounts';
import { bootstrapRouter } from './routes/bootstrap';
import { statusRouter } from './routes/status';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { initDb } from './db/client';

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Body parsing — raw for webhook verification, JSON for everything else
app.use('/v1/webhooks/meta', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/v1', limiter);

// Public routes
app.use('/v1/status', statusRouter);
app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/bootstrap', bootstrapRouter);

// Authenticated routes
app.use('/v1/messages', authMiddleware, messagesRouter);
app.use('/v1/accounts', authMiddleware, accountsRouter);

// Error handler
app.use(errorHandler);

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`WhatAgent API running on port ${PORT}`);
  });
}

start().catch(console.error);
