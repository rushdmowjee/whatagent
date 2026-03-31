# Add WhatsApp to Windsurf in 60 Seconds

Send WhatsApp messages directly from Windsurf using the `@whatagent/mcp` MCP server.

## Step 1 — Add to Windsurf MCP config

Open Windsurf Settings → MCP → **Add Server**, or edit `~/.codeium/windsurf/mcp_config.json`:

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

## Step 2 — Reload Windsurf

Restart Windsurf or reload MCP servers. You should see `whatagent` listed with a green status dot in the MCP panel.

## Step 3 — Send a Message via Cascade

In the Windsurf Cascade chat:

> "Send a WhatsApp message to +14155552671 saying 'Hello from Windsurf!'"

Cascade will call `send_whatsapp_message` and confirm delivery.

## First-Time Setup (no API key)

Ask Cascade:

> "Set up WhatAgent for me"

It will call `setup_whatagent` and walk you through connecting your WhatsApp Business account — no Meta dashboard hunting required. You'll get a `wha_` API key delivered directly in the chat.

## Available Tools

| Tool | What it does |
|------|-------------|
| `setup_whatagent` | First-time setup wizard |
| `send_whatsapp_message` | Send a text message |
| `send_whatsapp_template` | Send an approved template |
| `get_message_status` | Check delivery status |
| `list_recent_messages` | View sent/received messages |
| `configure_webhook` | Set a URL to receive replies |
| `get_account` | View account details |

## Receive WhatsApp Replies (Webhook)

> "Configure my webhook URL to https://my-app.com/whatsapp"

WhatAgent will POST events to your URL whenever a WhatsApp reply arrives:

```json
{
  "event": "message.received",
  "message": { "id": "msg_xxx", "from": "+14155552671", "type": "text", "text": "Hello!" }
}
```

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) — free tier includes 2,000 messages/month.

| Plan | Price | Messages/mo |
|------|-------|-------------|
| Hobby | Free | 2,000 |
| Developer | $29/mo | 100,000 |
| Scale | $99/mo | 500,000 |
