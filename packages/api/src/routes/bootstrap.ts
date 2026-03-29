import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client';
import { encrypt, generateApiKey, generateId, hashApiKey } from '../services/crypto';
import { validateCredentials } from '../services/meta';

export const bootstrapRouter = Router();

// POST /v1/bootstrap — first-time setup: create account + first API key
// Uses BOOTSTRAP_SECRET env var for auth (not a wha_ key)
bootstrapRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const bootstrapSecret = process.env.BOOTSTRAP_SECRET;
  if (!bootstrapSecret) {
    res.status(503).json({ error: 'Bootstrap not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${bootstrapSecret}`) {
    res.status(401).json({ error: 'Invalid bootstrap secret' });
    return;
  }

  const schema = z.object({
    phone_number_id: z.string(),
    waba_id: z.string(),
    access_token: z.string(),
    webhook_url: z.string().url().optional(),
    key_name: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { phone_number_id, waba_id, access_token, webhook_url, key_name } = parsed.data;

  const validation = await validateCredentials(phone_number_id, access_token);
  if (!validation.valid) {
    res.status(422).json({ error: 'Meta credential validation failed', detail: validation.error });
    return;
  }

  const db = getDb();
  const accountId = generateId();
  const accessTokenEncrypted = encrypt(access_token);

  await db.query(
    `INSERT INTO accounts (id, phone_number_id, waba_id, access_token_encrypted, webhook_url, webhook_verify_token, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'whatagent_verify_2024', NOW(), NOW())`,
    [accountId, phone_number_id, waba_id, accessTokenEncrypted, webhook_url ?? null]
  );

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyId = generateId();

  await db.query(
    `INSERT INTO api_keys (id, key_hash, account_id, name, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [keyId, keyHash, accountId, key_name ?? 'default']
  );

  res.status(201).json({
    account_id: accountId,
    api_key: apiKey,
    display_phone_number: validation.displayPhoneNumber,
    note: 'Bootstrap complete. Store your API key — it will not be shown again.',
  });
});
