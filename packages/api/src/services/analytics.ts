import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://eu.posthog.com';
  if (!apiKey) return null;
  client = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 });
  return client;
}

export function captureAccountCreated(accountId: string, properties?: Record<string, unknown>): void {
  const ph = getClient();
  if (!ph) return;
  ph.identify({ distinctId: accountId, properties: { ...properties } });
  ph.capture({ distinctId: accountId, event: 'account_created', properties: { ...properties } });
}

export function captureMessageSent(accountId: string, isFirst: boolean, properties?: Record<string, unknown>): void {
  const ph = getClient();
  if (!ph) return;
  ph.capture({ distinctId: accountId, event: 'message_sent', properties: { is_first_message: isFirst, ...properties } });
  if (isFirst) {
    ph.capture({ distinctId: accountId, event: 'first_message_sent', properties: { ...properties } });
  }
}

export function captureSubscriptionCreated(accountId: string, properties?: Record<string, unknown>): void {
  const ph = getClient();
  if (!ph) return;
  ph.capture({ distinctId: accountId, event: 'subscription_created', properties: { ...properties } });
}

export async function shutdownAnalytics(): Promise<void> {
  if (client) await client.shutdown();
}
