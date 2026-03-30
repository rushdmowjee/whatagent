# Add WhatsApp to Cursor in 60 Seconds

Send WhatsApp messages directly from Cursor using the `@whatagent/mcp` MCP server.

## Step 1 — Add to `.cursor/mcp.json`

Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

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

No API key yet? Skip the `env` block — the server will guide you through setup when you first use it.

## Step 2 — Reload MCP Servers

Open Cursor Settings → MCP → **Reload** (or restart Cursor).

You should see `whatagent` listed with a green status dot.

## Step 3 — Send a Message

In the Cursor chat:

> "Send a WhatsApp message to +14155552671 saying 'Hello from Cursor!'"

Cursor's AI will call `send_whatsapp_message` and confirm delivery.

## First-Time Setup (no API key)

Ask the Cursor AI:

> "Set up WhatAgent for me"

It will call `setup_whatagent` and guide you through connecting your WhatsApp Business account step by step — no Meta dashboard hunting required.

## Receive Inbound Messages

> "Configure my webhook URL to https://my-app.com/whatsapp"

WhatAgent will POST to your URL whenever a WhatsApp reply arrives.

## Webhook Payload Format

```json
{
  "event": "message.received",
  "message": {
    "id": "msg_xxx",
    "from": "+14155552671",
    "type": "text",
    "text": "Your reply here",
    "timestamp": "1712345678"
  }
}
```

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) or use the `setup_whatagent` tool inside Cursor.
