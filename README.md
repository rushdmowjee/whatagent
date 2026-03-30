# WhatAgent

The easiest way to send WhatsApp messages from code.

## Packages

| Package | Description |
|---------|-------------|
| `packages/api` | Hosted API service (Express + TypeScript) |
| `packages/sdk` | `whatagent` npm SDK — zero deps, 2-line send |
| `packages/mcp` | `@whatagent/mcp` — MCP server for Claude Code / Cursor / Windsurf |

## Quick Start (SDK)

```bash
npm install whatagent
```

```ts
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY });

await wa.messages.send({
  to: '+14155552671',
  text: 'Hello from WhatAgent!',
});
```

## Quick Start (MCP — Claude Code)

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "whatagent": {
      "command": "npx",
      "args": ["-y", "@whatagent/mcp"],
      "env": {
        "WHATAGENT_API_KEY": "wha_..."
      }
    }
  }
}
```

Then in Claude Code: "Send a WhatsApp message to +14155552671 saying hello"

## API Service — Deploy to Railway

### Prerequisites
- PostgreSQL database (Railway provides one free)
- Your Meta App credentials

### Steps

1. Push `packages/api` to a GitHub repo
2. Create a Railway project → New Service → GitHub Repo
3. Add a PostgreSQL database to the project
4. Set environment variables:

```
DATABASE_URL=<auto-filled by Railway>
ENCRYPTION_KEY=<run: openssl rand -hex 32>
BOOTSTRAP_SECRET=<any secret string>
META_APP_SECRET=<from Meta App Dashboard → Settings → Basic>
WEBHOOK_VERIFY_TOKEN=whatagent_verify_2024
```

5. Deploy — Railway builds and runs the Dockerfile
6. Get your deployment URL (e.g. `https://whatagent-production.up.railway.app`)

### First-time setup

```bash
# Bootstrap: create account + API key
curl -X POST https://YOUR_URL/v1/accounts/bootstrap \
  -H "Authorization: Bearer YOUR_BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number_id": "1036854129509651",
    "waba_id": "2858436544498712",
    "access_token": "EAA...",
    "webhook_url": "https://your-app.com/whatsapp"
  }'
```

Save the `api_key` from the response — that's your `WHATAGENT_API_KEY`.

### Configure Meta webhook

In Meta App Dashboard → WhatsApp → Configuration → Webhooks:
- Callback URL: `https://YOUR_URL/v1/webhooks/meta`
- Verify Token: `whatagent_verify_2024`
- Subscribe to: `messages`, `message_status_updates`

## AI Integration — Zero Guessing Required

If you are an AI model integrating WhatAgent, read [`llms.txt`](./llms.txt) or fetch it from the running API:

```
GET https://whatagent-production.up.railway.app/llms.txt
```

### Critical: Authentication

```
Authorization: Bearer wha_<your-api-key>
```

> **Do not** use `X-API-Key`. WhatAgent uses standard HTTP Bearer auth. Keys always start with `wha_`.

### Copy-paste curl commands

**Send a message:**
```bash
curl -X POST https://whatagent-production.up.railway.app/v1/messages \
  -H "Authorization: Bearer wha_xxx" \
  -H "Content-Type: application/json" \
  -d '{"to": "+14155552671", "text": "Hello from WhatAgent!"}'
```

**Bootstrap (first-time setup — uses BOOTSTRAP_SECRET, not a wha_ key):**
```bash
curl -X POST https://whatagent-production.up.railway.app/v1/bootstrap \
  -H "Authorization: Bearer YOUR_BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number_id": "1036854129509651",
    "waba_id": "2858436544498712",
    "access_token": "EAAxxxxxxxxxx"
  }'
```

**Connect Meta credentials:**
```bash
curl -X POST https://whatagent-production.up.railway.app/v1/accounts \
  -H "Authorization: Bearer wha_xxx" \
  -H "Content-Type: application/json" \
  -d '{"phone_number_id": "...", "waba_id": "...", "access_token": "EAA..."}'
```

### OpenAPI Spec

```
GET https://whatagent-production.up.railway.app/openapi.yaml
```

Also available as [`openapi.yaml`](./openapi.yaml) in this repo. Use it to auto-generate client code.

### Common Mistakes (avoid these)

| Wrong | Correct |
|-------|---------|
| `X-API-Key: wha_xxx` | `Authorization: Bearer wha_xxx` |
| `Authorization: wha_xxx` | `Authorization: Bearer wha_xxx` |
| Sending bootstrap secret to `/v1/messages` | Use a `wha_` key from bootstrap response |
| Omitting `Bearer ` prefix | Always include `Bearer ` (with space) |

## API Reference

### Send a message
```
POST /v1/messages
Authorization: Bearer wha_...

{ "to": "+14155552671", "text": "Hello!" }
```

### Get message status
```
GET /v1/messages/:id
```

### List messages
```
GET /v1/messages?limit=20
```
