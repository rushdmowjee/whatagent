export interface WhatAgentConfig {
  /** WhatsApp Business API access token */
  accessToken: string;
  /** WhatsApp Business Account phone number ID */
  phoneNumberId: string;
  /** API version (default: v19.0) */
  apiVersion?: string;
}

/** Send a plain text message */
export interface SendTextOptions {
  /** Recipient phone number in E.164 format (e.g. +14155552671) */
  to: string;
  /** Message text */
  text: string;
}

/** A single component for a template message */
export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  /** Required for button components */
  sub_type?: 'quick_reply' | 'url';
  /** Required for button components */
  index?: number;
  parameters: TemplateParameter[];
}

export type TemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }
  | { type: 'image'; image: { link: string } }
  | { type: 'document'; document: { link: string; filename?: string } }
  | { type: 'video'; video: { link: string } }
  | { type: 'payload'; payload: string };

/** Send a pre-approved template message */
export interface SendTemplateOptions {
  /** Recipient phone number in E.164 format (e.g. +14155552671) */
  to: string;
  /** Approved template name */
  templateName: string;
  /** BCP-47 language code, e.g. "en_US" */
  languageCode: string;
  /** Template components with variable values */
  components?: TemplateComponent[];
}

/** @deprecated Use SendTextOptions instead */
export interface SendMessageOptions extends SendTextOptions {}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
