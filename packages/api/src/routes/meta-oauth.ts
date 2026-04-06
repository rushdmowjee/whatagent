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
 * GET /v1/auth/meta/callback
 * Receives the ES Response Code redirect from the WhatsApp Embedded Signup popup.
 * Passes the code back to the opener window via postMessage, then closes the popup.
 */
metaOauthRouter.get('/callback', (req: Request, res: Response): void => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;
  const errorDescription = req.query.error_description as string | undefined;

  const payload = error
    ? { error: errorDescription || error }
    : code
      ? { code, state: state || '' }
      : { error: 'No code returned by Meta.' };

  const script = `window.opener?.postMessage(${JSON.stringify(payload)},'*');window.close();`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>Connecting...</title></head><body><script>${script}<\/script></body></html>`);
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

  // The redirect_uri used in the OAuth dialog popup (facebook.com/dialog/oauth).
  // This must match in the token exchange for standard OAuth codes.
  // For ES Response Codes (business.facebook.com/onboard), Meta ignores this field — but
  // including it is harmless and required for standard codes to prevent error 36008.
  const callbackRedirectUri = `${apiBase}/v1/auth/meta/callback`;

  try {
    // Step 1: Exchange OAuth code → business integration system user access token.
    // Includes redirect_uri to match what was sent in the dialog URL (required for
    // standard OAuth codes; harmless for ES Response Codes).
    console.log(`${logPrefix} step1: exchanging code redirect_uri=${callbackRedirectUri} app_id=${appId}`);
    let tokenResp: { data: { access_token?: string; error?: { message: string; code: number; type: string } } };
    try {
      tokenResp = await axios.get(
        `${META_GRAPH_BASE}/v22.0/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: callbackRedirectUri,
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

    // Step 3: Resolve WABA ID and phone number ID via debug_token granular_scopes.
    // The Embedded Signup token has whatsapp_business_management scope but NOT business_management,
    // so /me/businesses returns (#100) Missing Permission. The correct approach is to call
    // debug_token: granular_scopes for whatsapp_business_management → WABA IDs,
    // granular_scopes for whatsapp_business_messaging → phone number IDs directly.
    console.log(`${logPrefix} step3: resolving IDs via debug_token`);
    const appToken = `${appId}|${appSecret}`;
    const debugResp = await axios.get<{
      data?: {
        scopes?: string[];
        granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
        user_id?: string;
      };
    }>(
      `${META_GRAPH_BASE}/debug_token`,
      {
        params: { input_token: accessToken, access_token: appToken },
      }
    );
    console.log(`${logPrefix} step3 debug_token response:`, JSON.stringify(debugResp.data));
    const granularScopes = debugResp.data.data?.granular_scopes ?? [];
    const wabaScope = granularScopes.find((s) => s.scope === 'whatsapp_business_management');
    const messagingScope = granularScopes.find((s) => s.scope === 'whatsapp_business_messaging');
    console.log(`${logPrefix} step3 waba_scope target_ids:`, JSON.stringify(wabaScope?.target_ids));
    console.log(`${logPrefix} step3 messaging_scope target_ids:`, JSON.stringify(messagingScope?.target_ids));

    const wabaId = wabaScope?.target_ids?.[0];
    // Fast-path: if we have phone number IDs directly from messaging scope, use them
    const directPhoneNumberId = messagingScope?.target_ids?.[0];

    if (!wabaId && !directPhoneNumberId) {
      console.error(`${logPrefix} step3 FAILED no WABA or phone IDs in granular_scopes. scopes=${JSON.stringify(debugResp.data.data?.scopes)}`);
      res.status(422).json({
        error: 'No WhatsApp Business Account found. In the Meta popup, create or select a Business Portfolio and WhatsApp Business Account, then try again. If Meta never offers that option, the embedded signup configuration likely needs to be fixed in the Meta App Dashboard.',
      });
      return;
    }
    if (wabaId) {
      console.log(`${logPrefix} step3 OK waba_id=${wabaId}`);
    } else {
      console.log(`${logPrefix} step3 OK (no WABA, using direct phone_number_id=${directPhoneNumberId})`);
    }

    // Step 4: Resolve phone number ID — skip if already obtained from messaging scope
    let phoneNumberId: string;
    let displayPhoneNumber: string;

    if (directPhoneNumberId && !wabaId) {
      // Fast-path: phone number ID came directly from whatsapp_business_messaging granular scope
      console.log(`${logPrefix} step4: looking up phone number details for id=${directPhoneNumberId}`);
      const phoneDetailResp = await axios.get<{ id: string; display_phone_number: string }>(
        `${META_GRAPH_BASE}/${META_API_VERSION}/${directPhoneNumberId}`,
        { params: { fields: 'id,display_phone_number', access_token: accessToken } }
      );
      console.log(`${logPrefix} step4 response:`, JSON.stringify(phoneDetailResp.data));
      phoneNumberId = phoneDetailResp.data.id;
      displayPhoneNumber = phoneDetailResp.data.display_phone_number;
    } else {
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
        res.status(422).json({
          error: 'No phone numbers found in your WhatsApp Business Account. Finish adding a number in the Meta signup flow, then try again.',
        });
        return;
      }
      phoneNumberId = phone.id;
      displayPhoneNumber = phone.display_phone_number;
    }
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
