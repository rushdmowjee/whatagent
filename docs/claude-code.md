# Add WhatsApp to Claude Code in 60 Seconds

Send WhatsApp messages directly from Claude Code using the `@whatagent/mcp` MCP server.

## Step 1 — Add to `.claude/settings.json`

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

No API key yet? Skip the `env` block — the server will guide you through setup automatically when you first use it.

## Step 2 — Reload Claude Code

Open the command palette → **"MCP: Reload servers"** (or restart Claude Code).

## Step 3 — Send a Message

In any chat:

> "Send a WhatsApp message to +14155552671 saying 'Hello from Claude Code!'"

Claude will call `send_whatsapp_message` and confirm delivery.

## First-Time Setup (no API key)

If you haven't set up WhatAgent yet, just ask Claude:

> "Set up WhatAgent for me"

Claude will call `setup_whatagent` and walk you through connecting your WhatsApp Business account step by step.

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

## Receive Inbound Messages

To receive WhatsApp replies in your app:

> "Configure my webhook URL to https://my-app.com/whatsapp"

Claude will call `configure_webhook` and WhatAgent will POST events to your URL when messages arrive.

## Get Your API Key

Sign up at [whatagent.dev](https://whatagent.dev) or use the `setup_whatagent` tool inside Claude Code.
