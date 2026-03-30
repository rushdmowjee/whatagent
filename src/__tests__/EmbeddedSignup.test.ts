import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { EmbeddedSignup, EmbeddedSignupError, EMBEDDED_SIGNUP_SCOPES } from '../embedded-signup.js';

const CONFIG = {
  appId: 'test-app-id',
  appSecret: 'test-app-secret',
  redirectUri: 'https://app.example.com/v1/auth/meta/callback',
};

describe('EmbeddedSignup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStartConfig()', () => {
    it('returns appId and required scopes', () => {
      const signup = new EmbeddedSignup(CONFIG);
      const config = signup.getStartConfig();
      expect(config.appId).toBe('test-app-id');
      expect(config.scopes).toEqual(expect.arrayContaining([...EMBEDDED_SIGNUP_SCOPES]));
    });

    it('does not expose the app secret', () => {
      const signup = new EmbeddedSignup(CONFIG);
      const config = signup.getStartConfig();
      expect(JSON.stringify(config)).not.toContain('test-app-secret');
    });
  });

  describe('exchangeCode()', () => {
    function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
      let call = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        const r = responses[call++];
        return {
          ok: r.ok,
          status: r.ok ? 200 : 400,
          text: async () => JSON.stringify(r.body),
          json: async () => r.body,
        } as unknown as Response;
      });
    }

    it('returns WhatAgentConfig on successful exchange', async () => {
      mockFetchSequence([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        {
          ok: true,
          body: {
            data: [
              {
                whatsapp_business_accounts: {
                  data: [{ id: 'waba-123' }],
                },
              },
            ],
          },
        },
        {
          ok: true,
          body: { data: [{ id: 'phone-456', display_phone_number: '+1 415 555 2671' }] },
        },
      ]);

      const signup = new EmbeddedSignup(CONFIG);
      const result = await signup.exchangeCode('my-code');

      expect(result.wabaId).toBe('waba-123');
      expect(result.phoneNumberId).toBe('phone-456');
      expect(result.accessToken).toBe('long-token');
      expect(result.config).toEqual({
        accessToken: 'long-token',
        phoneNumberId: 'phone-456',
      });
    });

    it('throws EmbeddedSignupError on HTTP failure during code exchange', async () => {
      mockFetchSequence([{ ok: false, body: { error: { message: 'Invalid code' } } }]);

      const signup = new EmbeddedSignup(CONFIG);
      await expect(signup.exchangeCode('bad-code')).rejects.toThrow(EmbeddedSignupError);
    });

    it('throws EmbeddedSignupError when no WABA is found', async () => {
      mockFetchSequence([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        { ok: true, body: { data: [] } },
      ]);

      const signup = new EmbeddedSignup(CONFIG);
      await expect(signup.exchangeCode('code')).rejects.toThrow(
        'No WhatsApp Business Account found'
      );
    });

    it('throws EmbeddedSignupError when no phone numbers are found', async () => {
      mockFetchSequence([
        { ok: true, body: { access_token: 'short-token' } },
        { ok: true, body: { access_token: 'long-token' } },
        {
          ok: true,
          body: {
            data: [{ whatsapp_business_accounts: { data: [{ id: 'waba-123' }] } }],
          },
        },
        { ok: true, body: { data: [] } },
      ]);

      const signup = new EmbeddedSignup(CONFIG);
      await expect(signup.exchangeCode('code')).rejects.toThrow('No phone numbers found');
    });

    it('throws EmbeddedSignupError on Meta API error response', async () => {
      mockFetchSequence([
        { ok: true, body: { access_token: 'short-token' } },
        {
          ok: true,
          body: { error: { message: 'Token expired' } },
        },
      ]);

      const signup = new EmbeddedSignup(CONFIG);
      await expect(signup.exchangeCode('code')).rejects.toThrow('Token expired');
    });
  });

  describe('EmbeddedSignupError', () => {
    it('has correct name', () => {
      const err = new EmbeddedSignupError('test');
      expect(err.name).toBe('EmbeddedSignupError');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
