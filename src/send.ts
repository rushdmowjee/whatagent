#!/usr/bin/env node
/**
 * WhatAgent POC — send a WhatsApp message from the command line.
 *
 * Usage:
 *   node dist/send.js <to> <message>
 *
 * Required env vars:
 *   WHATSAPP_TOKEN       — Meta Cloud API access token (permanent token or short-lived)
 *   WHATSAPP_PHONE_ID    — Phone number ID from the Meta developer dashboard
 *
 * Example:
 *   WHATSAPP_TOKEN=xxx WHATSAPP_PHONE_ID=yyy node dist/send.js +14155552671 'hello world'
 *
 * To use the sandbox during development:
 *   1. Go to https://developers.facebook.com → Your App → WhatsApp → API Setup
 *   2. Copy the temporary access token and the test phone number ID
 *   3. Add your personal number as a test recipient in the dashboard
 *   4. Run this script — no approval needed for sandbox numbers
 */

import { WhatAgent } from './WhatAgent.js';

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
const [, , to, ...rest] = process.argv;
const text = rest.join(' ');

if (!token || !phoneNumberId) {
  console.error('Error: WHATSAPP_TOKEN and WHATSAPP_PHONE_ID env vars are required.');
  console.error('');
  console.error('  export WHATSAPP_TOKEN=<your-token>');
  console.error('  export WHATSAPP_PHONE_ID=<your-phone-number-id>');
  process.exit(1);
}

if (!to || !text) {
  console.error('Usage: node dist/send.js <to> <message>');
  console.error('');
  console.error("  node dist/send.js +14155552671 'hello world'");
  process.exit(1);
}

const agent = new WhatAgent({ accessToken: token, phoneNumberId });

console.log(`Sending to ${to}: "${text}" …`);

const result = await agent.sendMessage({ to, text });

if (result.success) {
  console.log(`✓ Sent — message ID: ${result.messageId}`);
} else {
  console.error(`✗ Failed: ${result.error}`);
  process.exit(1);
}
