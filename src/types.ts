export interface WhatAgentConfig {
  /** WhatsApp Business API access token */
  accessToken: string;
  /** WhatsApp Business Account phone number ID */
  phoneNumberId: string;
  /** API version (default: v19.0) */
  apiVersion?: string;
}

export interface SendMessageOptions {
  /** Recipient phone number in E.164 format (e.g. +14155552671) */
  to: string;
  /** Message text */
  text: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
