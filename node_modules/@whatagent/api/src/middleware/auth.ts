import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { getDb } from '../db/client';

export interface AuthedRequest extends Request {
  accountId: string;
  apiKeyId: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith('wha_')) {
    res.status(401).json({ error: 'Invalid API key format' });
    return;
  }

  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const db = getDb();

  const result = await db.query(
    `SELECT id, account_id FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const { id: apiKeyId, account_id: accountId } = result.rows[0];

  // Update last used (fire and forget)
  db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKeyId]).catch(() => {});

  (req as AuthedRequest).accountId = accountId;
  (req as AuthedRequest).apiKeyId = apiKeyId;
  next();
}
