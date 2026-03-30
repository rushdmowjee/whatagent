/**
 * WhatAgent - The easiest way to send WhatsApp messages from code.
 */

export { WhatAgent } from './WhatAgent.js';
export type {
  WhatAgentConfig,
  SendTextOptions,
  SendTemplateOptions,
  SendMessageOptions,
  SendMessageResult,
  TemplateComponent,
  TemplateParameter,
} from './types.js';

export { EmbeddedSignup, EmbeddedSignupError, EMBEDDED_SIGNUP_SCOPES } from './embedded-signup.js';
export type {
  EmbeddedSignupConfig,
  EmbeddedSignupStartResponse,
  EmbeddedSignupCallbackResponse,
} from './embedded-signup.js';
