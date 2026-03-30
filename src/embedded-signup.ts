import type { WhatAgentConfig } from './types.js';

/** Configuration for the EmbeddedSignup helper (server-side only) */
export interface EmbeddedSignupConfig {
  /** Your Meta App ID (safe to expose to the frontend) */
  appId: string;
  /** Your Meta App Secret (keep server-side, never expose to the frontend) */
  appSecret: string;
  /**
   * OAuth redirect URI — must match the redirect_uri you registered in the
   * Meta App Dashboard under Facebook Login → OAuth Settings.
   * For the Embedded Signup popup flow this is typically `https://yourdomain.com/v1/auth/meta/callback`.
   */
  redirectUri: string;
  /** Graph API version (default: v19.0) */
  apiVersion?: string;
}

/**
 * The response from `getStartConfig()` — send this to the frontend so it
 * can initialise the Meta Embedded Signup widget.
 */
export interface EmbeddedSignupStartResponse {
  appId: string;
  scopes: string[];
}

/** Raw WABA + phone data returned alongside the resolved WhatAgentConfig */
export interface EmbeddedSignupCallbackResponse {
  /** WhatsApp Business Account ID */
  wabaId: string;
  /** Phone Number ID to use when sending messages */
  phoneNumberId: string;
  /** Long-lived user access token (60 days) */
  accessToken: string;
  /**
   * Ready-to-use WhatAgentConfig. Persist this securely (encrypted at rest)
   * and pass it to `new WhatAgent(config)` to start sending immediately.
   */
  config: WhatAgentConfig;
}

const META_BASE = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v19.0';

/**
 * Permissions required for WhatsApp Business messaging.
 * Added to the Embedded Signup widget via the `scope` parameter.
 */
export const EMBEDDED_SIGNUP_SCOPES = [
  'whatsapp_business_messaging',
  'whatsapp_business_management',
] as const;

/**
 * Server-side helper for the Meta Embedded Signup (BYON) OAuth flow.
 *
 * ## Flow
 * 1. Serve `getStartConfig()` from `GET /v1/auth/meta/start`
 * 2. Frontend initialises the Meta JS SDK using the returned `appId` + `scopes`
 * 3. User completes the popup; frontend posts the returned `code` to your callback endpoint
 * 4. Call `exchangeCode(code)` from `POST /v1/auth/meta/callback`
 * 5. Persist `result.config` (encrypted at rest) — pass to `new WhatAgent(config)` to start sending
 *
 * @example
 * ```ts
 * // server.ts (Express example)
 * import { EmbeddedSignup } from 'whatagent';
 *
 * const signup = new EmbeddedSignup({
 *   appId: process.env.META_APP_ID!,
 *   appSecret: process.env.META_APP_SECRET!,
 *   redirectUri: 'https://app.example.com/v1/auth/meta/callback',
 * });
 *
 * app.get('/v1/auth/meta/start', (_req, res) => {
 *   res.json(signup.getStartConfig());
 * });
 *
 * app.post('/v1/auth/meta/callback', async (req, res) => {
 *   const { code } = req.body;
 *   const result = await signup.exchangeCode(code);
 *   // Encrypt and persist result.config for this user
 *   await db.users.update({ whatsappConfig: encrypt(result.config) });
 *   res.json({ success: true, phoneNumberId: result.phoneNumberId });
 * });
 * ```
 *
 * ## Frontend snippet
 * ```html
 * <script>
 * async function connectWhatsApp() {
 *   const { appId, scopes } = await fetch('/v1/auth/meta/start').then(r => r.json());
 *
 *   await new Promise((resolve) => {
 *     window.fbAsyncInit = function () {
 *       FB.init({ appId, cookie: true, xfbml: true, version: 'v19.0' });
 *       resolve();
 *     };
 *     const s = document.createElement('script');
 *     s.src = 'https://connect.facebook.net/en_US/sdk.js';
 *     document.head.appendChild(s);
 *   });
 *
 *   FB.login(async (response) => {
 *     if (response.authResponse?.code) {
 *       await fetch('/v1/auth/meta/callback', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ code: response.authResponse.code }),
 *       });
 *       alert('WhatsApp connected!');
 *     }
 *   }, { scope: scopes.join(','), response_type: 'code', override_default_response_type: true });
 * }
 * </script>
 * <button onclick="connectWhatsApp()">Connect WhatsApp</button>
 * ```
 */
export class EmbeddedSignup {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly apiVersion: string;

  constructor(config: EmbeddedSignupConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.redirectUri = config.redirectUri;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  }

  /**
   * Returns the config the frontend needs to initialise the Embedded Signup
   * widget. Only exposes `appId` and `scopes` — never the app secret.
   *
   * Serve this from `GET /v1/auth/meta/start`.
   */
  getStartConfig(): EmbeddedSignupStartResponse {
    return {
      appId: this.appId,
      scopes: [...EMBEDDED_SIGNUP_SCOPES],
    };
  }

  /**
   * Exchanges the OAuth `code` returned by the Embedded Signup widget for a
   * long-lived access token and resolves the WABA / phone number details.
   *
   * Call this from `POST /v1/auth/meta/callback`.
   *
   * @throws {EmbeddedSignupError} if any step of the Meta API exchange fails
   */
  async exchangeCode(code: string): Promise<EmbeddedSignupCallbackResponse> {
    const shortLivedToken = await this.fetchUserAccessToken(code);
    const longLivedToken = await this.fetchLongLivedToken(shortLivedToken);
    const { wabaId, phoneNumberId } = await this.resolveWhatsAppDetails(longLivedToken);

    return {
      wabaId,
      phoneNumberId,
      accessToken: longLivedToken,
      config: { accessToken: longLivedToken, phoneNumberId },
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /** Exchange OAuth code → short-lived user access token */
  private async fetchUserAccessToken(code: string): Promise<string> {
    const url = new URL(`${META_BASE}/oauth/access_token`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('redirect_uri', this.redirectUri);

    return this.extractToken(await fetch(url.toString()), 'code exchange');
  }

  /** Upgrade short-lived user token → long-lived user token (60 days) */
  private async fetchLongLivedToken(shortLivedToken: string): Promise<string> {
    const url = new URL(`${META_BASE}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    return this.extractToken(await fetch(url.toString()), 'long-lived token exchange');
  }

  /** Resolve the first WABA ID and phone number ID the user has access to */
  private async resolveWhatsAppDetails(
    accessToken: string
  ): Promise<{ wabaId: string; phoneNumberId: string }> {
    const wabaId = await this.fetchWabaId(accessToken);
    const phoneNumberId = await this.fetchPhoneNumberId(wabaId, accessToken);
    return { wabaId, phoneNumberId };
  }

  private async fetchWabaId(accessToken: string): Promise<string> {
    const url = new URL(`${META_BASE}/${this.apiVersion}/me/businesses`);
    url.searchParams.set('fields', 'whatsapp_business_accounts');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url.toString());
    const data = await this.parseJson<{
      data?: Array<{ whatsapp_business_accounts?: { data: Array<{ id: string }> } }>;
    }>(response, 'business account lookup');

    const wabaId = data.data?.[0]?.whatsapp_business_accounts?.data?.[0]?.id;
    if (!wabaId) {
      throw new EmbeddedSignupError('No WhatsApp Business Account found for this user');
    }
    return wabaId;
  }

  private async fetchPhoneNumberId(wabaId: string, accessToken: string): Promise<string> {
    const url = new URL(`${META_BASE}/${this.apiVersion}/${wabaId}/phone_numbers`);
    url.searchParams.set('fields', 'id,display_phone_number');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url.toString());
    const data = await this.parseJson<{ data?: Array<{ id: string }> }>(
      response,
      'phone number lookup'
    );

    const phoneNumberId = data.data?.[0]?.id;
    if (!phoneNumberId) {
      throw new EmbeddedSignupError(
        'No phone numbers found in WhatsApp Business Account. ' +
          'Ensure the user has a verified phone number registered to their WABA.'
      );
    }
    return phoneNumberId;
  }

  private async extractToken(response: Response, step: string): Promise<string> {
    const data = await this.parseJson<{ access_token?: string }>(response, step);
    if (!data.access_token) {
      throw new EmbeddedSignupError(`No access_token returned during ${step}`);
    }
    return data.access_token;
  }

  private async parseJson<T extends object>(response: Response, step: string): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new EmbeddedSignupError(
        `Meta API error during ${step} (HTTP ${response.status}): ${body}`
      );
    }
    const data = (await response.json()) as T & { error?: { message: string } };
    if ('error' in data && data.error) {
      throw new EmbeddedSignupError(`Meta API error during ${step}: ${data.error.message}`);
    }
    return data;
  }
}

/** Thrown when any step of the Meta Embedded Signup OAuth exchange fails */
export class EmbeddedSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddedSignupError';
  }
}
