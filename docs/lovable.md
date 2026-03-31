# Add WhatsApp to Lovable in 60 Seconds

Send WhatsApp messages from your Lovable app using the WhatAgent Node.js SDK.

## Step 1 — Install the SDK

In your Lovable project terminal:

```bash
npm install whatagent
```

## Step 2 — Set Your API Key

In Lovable, go to **Project Settings → Environment Variables** and add:

```
WHATAGENT_API_KEY=wha_your_key_here
```

## Step 3 — Send a WhatsApp Message

```typescript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });

// In your Lovable action/function:
const result = await wa.messages.send({
  to: '+14155552671',
  text: 'Hello from my Lovable app!',
});

console.log('Sent:', result.id, result.status);
```

## Receive WhatsApp Replies (Webhook)

1. Create a Lovable API route (e.g. `/api/whatsapp-webhook`):

```typescript
// app/api/whatsapp-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.event === 'message.received') {
    const { from, text } = body.message;
    console.log(`Received from ${from}: ${text}`);
    // Handle the inbound message here
  }

  return NextResponse.json({ ok: true });
}
```

2. Register your webhook URL with WhatAgent:

```typescript
const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });

await fetch('https://api.whatagent.dev/v1/accounts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.WHATAGENT_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    webhook_url: 'https://your-lovable-app.lovable.app/api/whatsapp-webhook',
  }),
});
```

## Full Example — Notify on Form Submission

```typescript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });

async function onFormSubmit(data: { name: string; phone: string }) {
  await wa.messages.send({
    to: data.phone,
    text: `Hi ${data.name}! Your submission was received. We'll be in touch shortly.`,
  });
}
```

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) — free tier includes 500 messages total.

| Plan | Price | Messages | Numbers |
|------|-------|----------|---------|
| Hobby | Free | 500 total | 1 |
| Developer | $29/mo | 100,000 | 3 |
| Scale | $99/mo | 500,000 | 10 |
| Business | $299/mo | 2,000,000 | 30 |
| Enterprise | Custom | Unlimited | Unlimited |

Annual billing saves 20%. Meta message fees are billed separately by Meta to your WhatsApp Business Account — WhatAgent charges only for platform access.
