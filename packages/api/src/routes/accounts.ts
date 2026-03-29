import { Router, Response, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AuthedRequest } from '../middleware/auth';
import { getDb } from '../db/client';
import { encrypt, generateApiKey, generateId, hashApiKey } from '../services/crypto';
import { validateCredentials } from '../services/meta';

export const accountsRouter = Router();

// POST /v1/accounts — create/update account (connect Meta app)
accountsRouter.post('/', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const schema = z.object({
    phone_number_id: z.string(),
    waba_id: z.string(),
    access_token: z.string(),
    webhook_url: z.string().url().optional(),
    webhook_verify_token: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { phone_number_id, waba_id, access_token, webhook_url, webhook_verify_token } = parsed.data;

  const validation = await validateCredentials(phone_number_id, access_token);
  if (!validation.valid) {
    res.status(422).json({ error: 'Meta credential validation failed', detail: validation.error });
    return;
  }

  const db = getDb();
  const accessTokenEncrypted = encrypt(access_token);
  const existing = await db.query(`SELECT id FROM accounts WHERE id = $1`, [authed.accountId]);

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE accounts SET
         phone_number_id = $1,
         waba_id = $2,
         access_token_encrypted = $3,
         webhook_url = $4,
         webhook_verify_token = COALESCE($5, webhook_verify_token),
         updated_at = NOW()
       WHERE id = $6`,
      [phone_number_id, waba_id, accessTokenEncrypted, webhook_url ?? null, webhook_verify_token ?? null, authed.accountId]
    );
  } else {
    await db.query(
      `INSERT INTO accounts (id, phone_number_id, waba_id, access_token_encrypted, webhook_url, webhook_verify_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [authed.accountId, phone_number_id, waba_id, accessTokenEncrypted, webhook_url ?? null, webhook_verify_token ?? 'whatagent_verify_2024']
    );
  }

  res.json({
    id: authed.accountId,
    phone_number_id,
    waba_id,
    display_phone_number: validation.displayPhoneNumber,
    webhook_url: webhook_url ?? null,
    status: 'active',
  });
}) as RequestHandler);

// GET /v1/accounts/me — get current account
accountsRouter.get('/me', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const db = getDb();
  const result = await db.query(
    `SELECT id, phone_number_id, waba_id, webhook_url, webhook_verify_token, created_at, updated_at
     FROM accounts WHERE id = $1`,
    [authed.accountId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Account not configured. POST /v1/accounts to connect your Meta app.' });
    return;
  }

  res.json(result.rows[0]);
}) as RequestHandler);

// POST /v1/accounts/keys — generate a new API key
accountsRouter.post('/keys', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const name = (req.body.name as string) || 'default';
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyId = generateId();

  const db = getDb();
  await db.query(
    `INSERT INTO api_keys (id, key_hash, account_id, name, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [keyId, keyHash, authed.accountId, name]
  );

  res.status(201).json({
    id: keyId,
    key: apiKey,
    name,
    note: 'Store this key — it will not be shown again.',
  });
}) as RequestHandler);
