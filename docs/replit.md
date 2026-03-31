# Add WhatsApp to Replit in 60 Seconds

Send WhatsApp messages from your Replit project using the WhatAgent SDK.

## Node.js / TypeScript

### Install

```bash
npm install whatagent
```

### Set Your Secret

In the Replit sidebar: **Secrets** → Add → Key: `WHATAGENT_API_KEY`, Value: `wha_your_key_here`

### Send a Message

```javascript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY });

const result = await wa.messages.send({
  to: '+14155552671',
  text: 'Hello from Replit!',
});

console.log('Sent!', result.id);
```

## Python

### Install

```bash
pip install whatagent
```

### Set Your Secret

In the Replit sidebar: **Secrets** → Add → Key: `WHATAGENT_API_KEY`, Value: `wha_your_key_here`

### Send a Message

```python
import os
from whatagent import WhatAgent

wa = WhatAgent(api_key=os.environ["WHATAGENT_API_KEY"])

result = wa.messages.send(to="+14155552671", text="Hello from Replit!")
print("Sent!", result.id, result.status)
```

## Replit Webhook Handler (Node.js + Express)

```javascript
import express from 'express';

const app = express();
app.use(express.json());

app.post('/whatsapp', (req, res) => {
  const { event, message } = req.body;
  if (event === 'message.received') {
    console.log(`Received from ${message.from}: ${message.text}`);
    // Reply back
    const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY });
    wa.messages.send({ to: message.from, text: 'Got your message!' });
  }
  res.json({ ok: true });
});

app.listen(3000);
```

Register your Replit URL as a webhook:

```javascript
await fetch('https://api.whatagent.dev/v1/accounts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.WHATAGENT_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    webhook_url: 'https://your-repl.replit.app/whatsapp',
  }),
});
```

## MCP on Replit (Agentic Workflows)

If your Replit project uses an AI agent or MCP Connector, add WhatAgent:

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

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) — free tier includes 2,000 messages/month.

| Plan | Price | Messages/mo | Numbers |
|------|-------|-------------|---------|
| Hobby | Free | 2,000 | 1 |
| Developer | $29/mo | 100,000 | 3 |
| Scale | $99/mo | 500,000 | 10 |
| Business | $299/mo | 2,000,000 | 30 |
| Enterprise | Custom | Unlimited | Unlimited |

Annual billing saves 20%. Meta message fees are billed separately by Meta to your WhatsApp Business Account — WhatAgent charges only for platform access.
