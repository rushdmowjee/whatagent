import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db/client';
import { generateApiKey, generateId, hashApiKey } from '../services/crypto';
import { captureAccountCreated } from '../services/analytics';

export const authRouter = Router();

// 3 registrations per IP per hour
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this IP, please try again later.' },
});

// POST /v1/auth/register — zero-touch account creation
// Accepts { email, app_name }, returns { api_key, account_id, free_tier_remaining }
// Idempotent: re-registering with same email revokes old key and issues a fresh one
authRouter.post('/register', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    email: z.string().email(),
    app_name: z.string().min(1).max(100),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { email, app_name } = parsed.data;
  const db = getDb();

  // Check if already registered (idempotent on email)
  const existing = await db.query(
    `SELECT account_id FROM registrations WHERE email = $1`,
    [email]
  );

  let accountId: string;
  const isNew = existing.rows.length === 0;

  if (!isNew) {
    accountId = existing.rows[0].account_id;
    // Revoke all active keys so the new one is the only valid one
    await db.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId]
    );
  } else {
    accountId = generateId();
    await db.query(
      `INSERT INTO registrations (id, email, app_name, account_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [generateId(), email, app_name, accountId]
    );
    captureAccountCreated(accountId, { email, app_name });
  }

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  await db.query(
    `INSERT INTO api_keys (id, key_hash, account_id, name, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [generateId(), keyHash, accountId, app_name]
  );

  res.status(201).json({
    api_key: apiKey,
    account_id: accountId,
    free_tier_remaining: 1000,
  });
});
