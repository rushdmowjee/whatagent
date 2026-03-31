import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { messagesRouter } from './routes/messages';
import { webhooksRouter } from './routes/webhooks';
import { stripeRouter } from './routes/stripe';
import { accountsRouter } from './routes/accounts';
import { bootstrapRouter } from './routes/bootstrap';
import { authRouter } from './routes/auth';
import { metaOauthRouter } from './routes/meta-oauth';
import { statusRouter } from './routes/status';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { initDb } from './db/client';

// Resolve app root: at runtime __dirname = /app/dist, so /app is one level up
const REPO_ROOT = join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy so express-rate-limit can read X-Forwarded-For correctly
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Body parsing — raw for webhook verification, JSON for everything else
app.use('/v1/webhooks/meta', express.raw({ type: 'application/json' }));
app.use('/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/v1', limiter);

// AI-friendly integration context — served at root for easy discovery
app.get('/llms.txt', (_req, res) => {
  try {
    const content = readFileSync(join(REPO_ROOT, 'llms.txt'), 'utf-8');
    res.type('text/plain').send(content);
  } catch {
    res.status(404).type('text/plain').send('Not found');
  }
});

app.get('/openapi.yaml', (_req, res) => {
  try {
    const content = readFileSync(join(REPO_ROOT, 'openapi.yaml'), 'utf-8');
    res.type('application/yaml').send(content);
  } catch {
    res.status(404).type('text/plain').send('Not found');
  }
});

// Public routes
app.use('/v1/status', statusRouter);
app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/webhooks', stripeRouter);
app.use('/v1/bootstrap', bootstrapRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/auth/meta', metaOauthRouter);

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
