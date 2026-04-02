import { Router, Request, Response } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getDb } from '../db/client';
import { generateApiKey, generateId, hashApiKey, encrypt } from '../services/crypto';
import { validateCredentials } from '../services/meta';
import { captureAccountCreated } from '../services/analytics';
import { PLAN_LIMITS } from '../services/plans';

export const metaOauthRouter = Router();

const META_GRAPH_BASE = 'https://graph.facebook.com';
const META_API_VERSION = 'v19.0';
const EMBEDDED_SIGNUP_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];

const callbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OAuth attempts from this IP, please try again later.' },
});

/**
 * GET /v1/auth/meta/start
 * Returns the Meta App ID and scopes needed to initialise the Embedded Signup widget.
 * Safe to call from the frontend — never returns the app secret.
 */
metaOauthRouter.get('/start', (req: Request, res: Response): void => {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !configId) {
    res.status(503).json({ error: 'Meta embedded signup is not configured on this server.' });
    return;
  }
  res.json({ app_id: appId, config_id: configId, scopes: EMBEDDED_SIGNUP_SCOPES });
});

/**
 * POST /v1/auth/meta/callback
 * Exchanges the OAuth code returned by the Embedded Signup widget for a WhatAgent API key.
 * Creates a new account (or re-uses an existing one for the same email) and immediately
 * connects the WhatsApp phone number — no manual credential entry required.
 *
 * Body: { email: string, app_name: string, code: string }
 * Returns: { api_key, account_id, phone_number_id, display_phone_number, free_tier_remaining }
 */
metaOauthRouter.post('/callback', callbackLimiter, async (req: Request, res: Response): Promise<void> => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const apiBase = process.env.API_BASE_URL || 'https://api.whatagent.dev';

  if (!appId || !appSecret) {
    res.status(503).json({ error: 'Meta embedded signup is not configured on this server.' });
    return;
  }

  const schema = z.object({
    email: z.string().email(),
    app_name: z.string().min(1).max(100).default('My App'),
    code: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { email, app_name, code } = parsed.data;

  try {
    // Step 1: Exchange Embedded Signup code → business integration system user access token.
    // Meta requires the redirect_uri to match what is registered in the app's Valid OAuth Redirect URIs.
    // This URL is registered there and must also be set in the Embedded Signup Configuration.
    const tokenResp = await axios.get<{ access_token: string }>(
      `${META_GRAPH_BASE}/v22.0/oauth/access_token`,
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code,
          redirect_uri: 'https://api.whatagent.dev/v1/auth/meta/callback',
        },
      }
    );
    // The Embedded Signup code exchange returns a business token (already long-lived, ~60 days).
    const accessToken = tokenResp.data.access_token;

    // Step 3: Resolve WABA ID
    const bizResp = await axios.get<{
      data?: Array<{ whatsapp_business_accounts?: { data: Array<{ id: string }> } }>;
    }>(
      `${META_GRAPH_BASE}/${META_API_VERSION}/me/businesses`,
      {
        params: { fields: 'whatsapp_business_accounts', access_token: accessToken },
      }
    );
    const wabaId = bizResp.data.data?.[0]?.whatsapp_business_accounts?.data?.[0]?.id;
    if (!wabaId) {
      res.status(422).json({ error: 'No WhatsApp Business Account found. Complete WhatsApp Business setup and try again.' });
      return;
    }

    // Step 4: Resolve phone number ID
    const phoneResp = await axios.get<{ data?: Array<{ id: string; display_phone_number: string }> }>(
      `${META_GRAPH_BASE}/${META_API_VERSION}/${wabaId}/phone_numbers`,
      {
        params: { fields: 'id,display_phone_number', access_token: accessToken },
      }
    );
    const phone = phoneResp.data.data?.[0];
    if (!phone) {
      res.status(422).json({ error: 'No phone numbers found in your WhatsApp Business Account.' });
      return;
    }
    const { id: phoneNumberId, display_phone_number: displayPhoneNumber } = phone;

    // Step 5: Validate credentials against Meta
    const validation = await validateCredentials(phoneNumberId, accessToken);
    if (!validation.valid) {
      res.status(422).json({ error: 'Meta credential validation failed', detail: validation.error });
      return;
    }

    // Step 6: Register account (idempotent on email)
    const db = getDb();
    const existing = await db.query(`SELECT account_id FROM registrations WHERE email = $1`, [email]);

    let accountId: string;
    const isNew = existing.rows.length === 0;

    if (!isNew) {
      accountId = existing.rows[0].account_id;
      await db.query(
        `UPDATE api_keys SET revoked_at = NOW() WHERE account_id = $1 AND revoked_at IS NULL`,
        [accountId]
      );
    } else {
      accountId = generateId();
      await db.query(
        `INSERT INTO registrations (id, email, app_name, account_id, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [generateId(), email, app_name, accountId]
      );
      captureAccountCreated(accountId, { email, app_name });
    }

    // Step 7: Issue API key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    await db.query(
      `INSERT INTO api_keys (id, key_hash, account_id, name, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [generateId(), keyHash, accountId, app_name]
    );

    // Step 8: Connect WhatsApp account
    const accessTokenEncrypted = encrypt(accessToken);
    const accountExists = await db.query(`SELECT id FROM accounts WHERE id = $1`, [accountId]);
    if (accountExists.rows.length > 0) {
      await db.query(
        `UPDATE accounts SET phone_number_id = $1, waba_id = $2, access_token_encrypted = $3, updated_at = NOW() WHERE id = $4`,
        [phoneNumberId, wabaId, accessTokenEncrypted, accountId]
      );
    } else {
      await db.query(
        `INSERT INTO accounts (id, phone_number_id, waba_id, access_token_encrypted, webhook_verify_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [accountId, phoneNumberId, wabaId, accessTokenEncrypted, 'whatagent_verify_2024']
      );
    }

    res.status(201).json({
      api_key: apiKey,
      account_id: accountId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      free_tier_remaining: PLAN_LIMITS.hobby.messagesPerMonth,
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const metaErrObj = err.response?.data?.error;
      if (metaErrObj) {
        console.error('Meta OAuth error response:', JSON.stringify(metaErrObj));
        res.status(422).json({
          error: 'Meta OAuth error',
          detail: metaErrObj.message,
          meta_code: metaErrObj.code,
          meta_subcode: metaErrObj.error_subcode,
          meta_type: metaErrObj.type,
        });
        return;
      }
    }
    console.error('Meta OAuth callback error:', err);
    res.status(500).json({ error: 'OAuth exchange failed. Please try again.' });
  }
});
