# Add WhatsApp to Cline in 60 Seconds

Send WhatsApp messages from Cline using the `@whatagent/mcp` MCP server.

## Step 1 — Add MCP Server in VS Code

Open VS Code with Cline installed → click the **MCP Servers** icon in the Cline panel → **Add MCP Server**.

Or manually edit your Cline MCP config (usually at `~/.vscode/cline_mcp_settings.json` or configured in Cline settings):

```json
{
  "mcpServers": {
    "whatagent": {
      "command": "npx",
      "args": ["-y", "@whatagent/mcp"],
      "env": {
        "WHATAGENT_API_KEY": "wha_your_key_here"
      }
    }
  }
}
```

No API key yet? Skip the `env` block — the server runs a guided setup wizard automatically.

## Step 2 — Reload Cline

Click **Restart MCP Servers** in the Cline panel, or reload the VS Code window. `whatagent` should appear with a connected status.

## Step 3 — Send a Message

In the Cline chat:

> "Send a WhatsApp message to +14155552671 saying 'Hello from Cline!'"

Cline will call `send_whatsapp_message` and confirm delivery.

## First-Time Setup (no API key)

Ask Cline:

> "Set up WhatAgent for me"

Cline will call `setup_whatagent` → you provide your Meta Business credentials → WhatAgent creates your account and returns your `wha_` API key with ready-to-paste config. No external dashboards needed.

## Build a WhatsApp Feature with Cline

Example prompt:

> "Add a WhatsApp notification to this Express app that sends a message when a new user signs up. Use WhatAgent."

Cline will:
1. Call `get_account` to confirm your WhatAgent setup
2. Write the Node.js integration using the `whatagent` SDK
3. Test with `send_whatsapp_message`

## Receive WhatsApp Replies

> "Configure my webhook URL to https://my-app.com/whatsapp"

WhatAgent will POST to that URL on inbound messages and delivery updates:

```json
{
  "event": "message.received",
  "message": { "id": "msg_xxx", "from": "+14155552671", "type": "text", "text": "Reply text" }
}
```

## Install the SDK Directly

```bash
npm install whatagent
```

```typescript
import { WhatAgent } from 'whatagent';

const wa = new WhatAgent({ apiKey: process.env.WHATAGENT_API_KEY! });
await wa.messages.send({ to: '+14155552671', text: 'Hello from Cline!' });
```

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) — free tier includes 500 messages total.

| Plan | Price | Messages |
|------|-------|----------|
| Hobby | Free | 500 total |
| Developer | $29/mo | 100,000 |
| Scale | $99/mo | 500,000 |
