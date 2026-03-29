import type { WhatAgentConfig, SendMessageOptions, SendMessageResult } from './types.js';

const DEFAULT_API_VERSION = 'v19.0';
const BASE_URL = 'https://graph.facebook.com';

export class WhatAgent {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;

  constructor(config: WhatAgentConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const url = `${BASE_URL}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: options.to,
      type: 'text',
      text: { body: options.text },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id;

    return { success: true, messageId };
  }
}
