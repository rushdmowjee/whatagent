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

  const logPrefix = `[meta-oauth][${Date.now()}]`;
  console.log(`${logPrefix} callback start email=${email} code_prefix=${code.slice(0, 8)}...`);

  try {
    // Step 1: Exchange Embedded Signup code → business integration system user access token.
    // The config_id popup flow returns the code directly to the FB.login() JS callback — there
    // is no redirect, so Meta does not record a redirect_uri for this code. Sending any
    // redirect_uri in the token exchange causes a mismatch error; omit it entirely.
    console.log(`${logPrefix} step1: exchanging code (no redirect_uri) app_id=${appId}`);
    let tokenResp: { data: { access_token?: string; error?: { message: string; code: number; type: string } } };
    try {
      tokenResp = await axios.get(
        `${META_GRAPH_BASE}/v22.0/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            code,
          },
        }
      );
    } catch (tokenErr: unknown) {
      if (axios.isAxiosError(tokenErr)) {
        console.error(`${logPrefix} step1 FAILED status=${tokenErr.response?.status}`, JSON.stringify(tokenErr.response?.data));
      }
      throw tokenErr;
    }
    // The Embedded Signup code exchange returns a business token (already long-lived, ~60 days).
    const accessToken = tokenResp.data.access_token;
    if (!accessToken) {
      console.error(`${logPrefix} step1 FAILED no access_token in response:`, JSON.stringify(tokenResp.data));
      res.status(422).json({ error: 'Meta did not return an access token', detail: tokenResp.data });
      return;
    }
    console.log(`${logPrefix} step1 OK token_prefix=${accessToken.slice(0, 10)}...`);

    // Step 3: Resolve WABA ID
    console.log(`${logPrefix} step3: resolving WABA ID`);
    const bizResp = await axios.get<{
      data?: Array<{ whatsapp_business_accounts?: { data: Array<{ id: string }> } }>;
    }>(
      `${META_GRAPH_BASE}/${META_API_VERSION}/me/businesses`,
      {
        params: { fields: 'whatsapp_business_accounts', access_token: accessToken },
      }
    );
    console.log(`${logPrefix} step3 response:`, JSON.stringify(bizResp.data));
    const wabaId = bizResp.data.data?.[0]?.whatsapp_business_accounts?.data?.[0]?.id;
    if (!wabaId) {
      console.error(`${logPrefix} step3 FAILED no WABA found in response`);
      res.status(422).json({ error: 'No WhatsApp Business Account found. Complete WhatsApp Business setup and try again.' });
      return;
    }
    console.log(`${logPrefix} step3 OK waba_id=${wabaId}`);

    // Step 4: Resolve phone number ID
    console.log(`${logPrefix} step4: resolving phone numbers for waba_id=${wabaId}`);
    const phoneResp = await axios.get<{ data?: Array<{ id: string; display_phone_number: string }> }>(
      `${META_GRAPH_BASE}/${META_API_VERSION}/${wabaId}/phone_numbers`,
      {
        params: { fields: 'id,display_phone_number', access_token: accessToken },
      }
    );
    console.log(`${logPrefix} step4 response:`, JSON.stringify(phoneResp.data));
    const phone = phoneResp.data.data?.[0];
    if (!phone) {
      console.error(`${logPrefix} step4 FAILED no phone numbers found`);
      res.status(422).json({ error: 'No phone numbers found in your WhatsApp Business Account.' });
      return;
    }
    const { id: phoneNumberId, display_phone_number: displayPhoneNumber } = phone;
    console.log(`${logPrefix} step4 OK phone_number_id=${phoneNumberId} display=${displayPhoneNumber}`);

    // Step 5: Validate credentials against Meta
    console.log(`${logPrefix} step5: validating credentials`);
    const validation = await validateCredentials(phoneNumberId, accessToken);
    if (!validation.valid) {
      console.error(`${logPrefix} step5 FAILED validation error:`, validation.error);
      res.status(422).json({ error: 'Meta credential validation failed', detail: validation.error });
      return;
    }
    console.log(`${logPrefix} step5 OK credentials valid`);

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
        console.error(`${logPrefix} Meta OAuth error response:`, JSON.stringify(metaErrObj));
        res.status(422).json({
          error: 'Meta OAuth error',
          detail: metaErrObj.message,
          meta_code: metaErrObj.code,
          meta_subcode: metaErrObj.error_subcode,
          meta_type: metaErrObj.type,
        });
        return;
      }
      console.error(`${logPrefix} Axios error status=${err.response?.status}:`, JSON.stringify(err.response?.data));
    }
    console.error(`${logPrefix} Meta OAuth callback error:`, err);
    res.status(500).json({ error: 'OAuth exchange failed. Please try again.' });
  }
});
