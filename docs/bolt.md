# Add WhatsApp to Bolt.new in 60 Seconds

Send WhatsApp messages from your Bolt.new app using the WhatAgent SDK.

## Step 1 — Install the SDK

In the Bolt.new terminal:

```bash
npm install whatagent
```

## Step 2 — Add Your API Key

In Bolt.new, create a `.env` file (or use the environment panel):

```
WHATAGENT_API_KEY=wha_your_key_here
```

## Step 3 — Send a Message

```typescript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: import.meta.env.VITE_WHATAGENT_API_KEY });

await wa.messages.send({
  to: '+14155552671',
  text: 'Hello from Bolt.new!',
});
```

> **Note:** For Vite-based Bolt projects, prefix env vars with `VITE_` and use `import.meta.env.VITE_WHATAGENT_API_KEY`.

## Server-Side (Node/Express Backend)

```typescript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });

// In an API route:
app.post('/api/notify', async (req, res) => {
  const { phone, message } = req.body;
  const result = await wa.messages.send({ to: phone, text: message });
  res.json({ id: result.id, status: result.status });
});
```

## Receive WhatsApp Replies

Create a POST endpoint to receive inbound messages:

```typescript
app.post('/api/whatsapp', express.json(), (req, res) => {
  const { event, message } = req.body;
  if (event === 'message.received') {
    console.log(`From ${message.from}: ${message.text}`);
  }
  res.json({ ok: true });
});
```

Then register your webhook:

```typescript
await fetch('https://api.whatagent.dev/v1/accounts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.WHATAGENT_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    webhook_url: 'https://your-bolt-app.com/api/whatsapp',
  }),
});
```

## Use the MCP Server in Bolt's AI Chat

If Bolt.new supports MCP tools in its AI, add to your MCP config:

```json
{
  "mcpServers": {
    "whatagent": {
      "command": "npx",
      "args": ["-y", "@whatagent/mcp"],
      "env": { "WHATAGENT_API_KEY": "wha_..." }
    }
  }
}
```

Then tell the AI: *"Send a WhatsApp to +14155552671 saying Hello!"*

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
