# WhatAgent

**The easiest way to send WhatsApp messages from code.**

WhatAgent is a lightweight TypeScript SDK that wraps the WhatsApp Business Cloud API, letting you send messages with a single function call.

## Usage

```ts
import { WhatAgent } from 'whatagent';

const agent = new WhatAgent({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
});

const result = await agent.sendMessage({
  to: '+14155552671',
  text: 'Hello from WhatAgent!',
});

console.log(result.messageId);
```

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) account
- A WhatsApp Business account with a phone number registered in the Cloud API
- An access token with `whatsapp_business_messaging` permission

## Installation

```bash
npm install whatagent
```

## API

### `new WhatAgent(config)`

| Field | Type | Required | Description |
|---|---|---|---|
| `accessToken` | `string` | Yes | WhatsApp Cloud API access token |
| `phoneNumberId` | `string` | Yes | Phone Number ID from Meta Business Manager |
| `apiVersion` | `string` | No | Graph API version (default: `v19.0`) |

### `agent.sendMessage(options)`

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | `string` | Yes | Recipient phone in E.164 format |
| `text` | `string` | Yes | Message body |

Returns `Promise<SendMessageResult>`:

```ts
interface SendMessageResult {
  success: boolean;
  messageId?: string; // wamid on success
  error?: string;     // error description on failure
}
```

## Status

Early development. API is subject to change.
