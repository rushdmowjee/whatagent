import { buildRequestOptions, request, RequestOptions } from './http';
import type {
  WhatAgentConfig,
  SendTextOptions,
  SendTemplateOptions,
  SendImageOptions,
  Message,
  SendResult,
  ListMessagesResult,
  ListMessagesOptions,
} from './types';

/**
 * WhatAgent client — the easiest way to send WhatsApp messages from code.
 *
 * @example
 * ```ts
 * import { WhatAgent } from 'whatagent';
 *
 * const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });
 *
 * await wa.messages.send({ to: '+14155552671', text: 'Hello!' });
 * ```
 */
export class WhatAgent {
  private opts: RequestOptions;

  /** Send and retrieve messages */
  readonly messages: Messages;

  constructor(config: WhatAgentConfig) {
    if (!config.apiKey) throw new Error('WhatAgent: apiKey is required');
    if (!config.apiKey.startsWith('wha_')) {
      throw new Error('WhatAgent: apiKey must start with wha_');
    }
    this.opts = buildRequestOptions(config);
    this.messages = new Messages(this.opts);
  }
}

class Messages {
  constructor(private opts: RequestOptions) {}

  /**
   * Send a WhatsApp message.
   *
   * @example Text message
   * ```ts
   * await wa.messages.send({ to: '+14155552671', text: 'Hello from WhatAgent!' });
   * ```
   *
   * @example Template message
   * ```ts
   * await wa.messages.send({
   *   to: '+14155552671',
   *   template: { name: 'hello_world', language: 'en_US' }
   * });
   * ```
   *
   * @example Image message
   * ```ts
   * await wa.messages.send({
   *   to: '+14155552671',
   *   image: { url: 'https://example.com/photo.jpg', caption: 'Check this out!' }
   * });
   * ```
   */
  async send(options: SendTextOptions | SendTemplateOptions | SendImageOptions): Promise<SendResult> {
    let body: Record<string, unknown>;

    if ('text' in options) {
      body = { type: 'text', to: options.to, text: options.text, preview_url: options.preview_url };
    } else if ('template' in options) {
      body = { type: 'template', to: options.to, template: options.template };
    } else {
      body = { type: 'image', to: options.to, image: options.image };
    }

    return request<SendResult>(this.opts, 'POST', '/v1/messages', body);
  }

  /**
   * Get a single message by ID.
   */
  async get(messageId: string): Promise<Message> {
    return request<Message>(this.opts, 'GET', `/v1/messages/${messageId}`);
  }

  /**
   * List recent messages (newest first).
   */
  async list(options: ListMessagesOptions = {}): Promise<ListMessagesResult> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.after) params.set('after', options.after);
    const qs = params.toString();
    return request<ListMessagesResult>(this.opts, 'GET', `/v1/messages${qs ? `?${qs}` : ''}`);
  }
}
