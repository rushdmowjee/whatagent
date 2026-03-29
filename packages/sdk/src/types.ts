export interface WhatAgentConfig {
  /** Your WhatAgent API key (starts with wha_) */
  apiKey: string;
  /** Override the API base URL (default: https://api.whatagent.dev) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'template' | 'image';
export type MessageDirection = 'outbound' | 'inbound';

export interface Message {
  id: string;
  direction: MessageDirection;
  to_number: string | null;
  from_number: string | null;
  type: MessageType;
  body: string | null;
  template_name: string | null;
  meta_message_id: string | null;
  status: MessageStatus;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SendResult {
  id: string;
  status: MessageStatus;
  to: string;
  meta_message_id: string;
}

export interface SendTextOptions {
  /** Recipient phone number in E.164 format (e.g. +14155552671) */
  to: string;
  /** Message text (max 4096 characters) */
  text: string;
  /** Enable link preview */
  preview_url?: boolean;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{
    type: 'text' | 'image' | 'document';
    text?: string;
    image?: { link: string };
  }>;
  sub_type?: string;
  index?: string;
}

export interface SendTemplateOptions {
  /** Recipient phone number in E.164 format */
  to: string;
  template: {
    /** Approved template name */
    name: string;
    /** Template language code (default: en_US) */
    language?: string;
    /** Template component parameters */
    components?: TemplateComponent[];
  };
}

export interface SendImageOptions {
  /** Recipient phone number in E.164 format */
  to: string;
  image: {
    /** Publicly accessible image URL */
    url: string;
    /** Optional caption */
    caption?: string;
  };
}

export type SendOptions = SendTextOptions | SendTemplateOptions | SendImageOptions;

export interface ListMessagesResult {
  messages: Message[];
  count: number;
}

export interface ListMessagesOptions {
  limit?: number;
  after?: string;
}
