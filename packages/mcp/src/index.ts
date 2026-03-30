#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { WhatAgent, WhatAgentError } from 'whatagent';

const BASE_URL = (process.env.WHATAGENT_BASE_URL ?? 'https://api.whatagent.dev').replace(/\/$/, '');
const apiKey = process.env.WHATAGENT_API_KEY;

// ---------------------------------------------------------------------------
// Setup wizard tools (shown when no API key is configured)
// ---------------------------------------------------------------------------

const SETUP_TOOLS: Tool[] = [
  {
    name: 'setup_whatagent',
    description:
      'First-time setup wizard for WhatAgent. Run this to connect your WhatsApp Business account and get an API key — no external dashboard needed.',
    inputSchema: {
      type: 'object',
      properties: {
        step: {
          type: 'string',
          enum: ['start', 'bootstrap'],
          description:
            '"start" to see what you need to gather; "bootstrap" to complete setup with your credentials.',
        },
        phone_number_id: {
          type: 'string',
          description: 'Meta WhatsApp Phone Number ID (required for step=bootstrap)',
        },
        waba_id: {
          type: 'string',
          description: 'Meta WhatsApp Business Account ID (required for step=bootstrap)',
        },
        access_token: {
          type: 'string',
          description: 'Meta permanent access token (required for step=bootstrap)',
        },
        webhook_url: {
          type: 'string',
          description:
            'Optional HTTPS URL to receive inbound WhatsApp messages and delivery receipts.',
        },
        bootstrap_secret: {
          type: 'string',
          description:
            'The BOOTSTRAP_SECRET from your WhatAgent deployment (required for step=bootstrap)',
        },
      },
      required: ['step'],
    },
  },
];

// ---------------------------------------------------------------------------
// Operational tools (shown when API key is configured)
// ---------------------------------------------------------------------------

const OPERATIONAL_TOOLS: Tool[] = [
  {
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp message to a phone number. Use for text messages, notifications, and alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number in E.164 format (e.g. +14155552671)',
        },
        text: {
          type: 'string',
          description: 'Message text (max 4096 characters)',
        },
      },
      required: ['to', 'text'],
    },
  },
  {
    name: 'send_whatsapp_template',
    description:
      'Send an approved WhatsApp template message. Templates are required for business-initiated messages outside the 24h window.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number in E.164 format',
        },
        template_name: {
          type: 'string',
          description: 'The approved template name (e.g. hello_world)',
        },
        language: {
          type: 'string',
          description: 'Template language code (default: en_US)',
        },
      },
      required: ['to', 'template_name'],
    },
  },
  {
    name: 'get_message_status',
    description: 'Get the delivery status of a previously sent WhatsApp message by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The message ID returned by send_whatsapp_message',
        },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'list_recent_messages',
    description: 'List recent WhatsApp messages sent and received on your account (newest first).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of messages to return (1-100, default: 10)',
        },
      },
    },
  },
  {
    name: 'configure_webhook',
    description:
      'Set or update the webhook URL that WhatAgent calls when you receive an inbound WhatsApp message or a delivery status update. Your server must accept POST requests at that URL.',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_url: {
          type: 'string',
          description: 'HTTPS URL to receive webhook events (e.g. https://your-app.com/whatsapp)',
        },
      },
      required: ['webhook_url'],
    },
  },
  {
    name: 'get_account',
    description:
      'Get the current WhatAgent account details: phone number, webhook URL, and connection status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Setup wizard handler
// ---------------------------------------------------------------------------

async function handleSetup(
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const parsed = z
    .object({
      step: z.enum(['start', 'bootstrap']),
      phone_number_id: z.string().optional(),
      waba_id: z.string().optional(),
      access_token: z.string().optional(),
      webhook_url: z.string().optional(),
      bootstrap_secret: z.string().optional(),
    })
    .parse(args ?? {});

  if (parsed.step === 'start') {
    return {
      content: [
        {
          type: 'text',
          text: `## WhatAgent Setup — What You Need

To connect WhatAgent to your WhatsApp Business account, collect the following from [Meta Business Manager](https://business.facebook.com/):

### Required
1. **Phone Number ID** — Meta Business Manager → WhatsApp → Phone Numbers → your number → "Phone number ID"
2. **WhatsApp Business Account ID (WABA ID)** — shown at the top of WhatsApp Manager
3. **Permanent Access Token** — Meta for Developers → your App → WhatsApp → API Setup → generate a System User permanent token
4. **Bootstrap Secret** — the \`BOOTSTRAP_SECRET\` environment variable set in your WhatAgent deployment

### Optional
- **Webhook URL** — an HTTPS endpoint on your server (e.g. \`https://your-app.com/whatsapp\`) to receive inbound messages and delivery updates

### Next Step
Once you have these, call \`setup_whatagent\` again with:
\`\`\`
step: "bootstrap"
phone_number_id: "..."
waba_id: "..."
access_token: "EAAxxxxxxxxxx"
bootstrap_secret: "your-bootstrap-secret"
webhook_url: "https://..." (optional)
\`\`\``,
        },
      ],
    };
  }

  // step === 'bootstrap'
  const { phone_number_id, waba_id, access_token, bootstrap_secret, webhook_url } = parsed;
  const missing: string[] = [];
  if (!phone_number_id) missing.push('phone_number_id');
  if (!waba_id) missing.push('waba_id');
  if (!access_token) missing.push('access_token');
  if (!bootstrap_secret) missing.push('bootstrap_secret');

  if (missing.length > 0) {
    return {
      content: [
        {
          type: 'text',
          text: `Missing required fields: ${missing.join(', ')}.\n\nCall setup_whatagent with step="start" to see what you need.`,
        },
      ],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/v1/bootstrap`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${bootstrap_secret}`,
        'Content-Type': 'application/json',
        'User-Agent': '@whatagent/mcp-setup/1.0.0',
      },
      body: JSON.stringify({
        phone_number_id,
        waba_id,
        access_token,
        ...(webhook_url && { webhook_url }),
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { content: [{ type: 'text', text: `Setup failed: ${msg}` }] };
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errMsg =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    return { content: [{ type: 'text', text: `Bootstrap failed: ${errMsg}` }] };
  }

  const result = body as { api_key: string; display_phone_number: string; account_id: string };

  return {
    content: [
      {
        type: 'text',
        text: `## WhatAgent Setup Complete!

**Your API Key:** \`${result.api_key}\`
**Phone Number:** ${result.display_phone_number}
**Account ID:** ${result.account_id}

> **Save your API key now — it will not be shown again.**

### Add your API key to the MCP config

**Claude Code** (add to \`.claude/settings.json\`):
\`\`\`json
{
  "mcpServers": {
    "whatagent": {
      "command": "npx",
      "args": ["-y", "@whatagent/mcp"],
      "env": { "WHATAGENT_API_KEY": "${result.api_key}" }
    }
  }
}
\`\`\`

**Cursor** (add to \`.cursor/mcp.json\`):
\`\`\`json
{
  "mcpServers": {
    "whatagent": {
      "command": "npx",
      "args": ["-y", "@whatagent/mcp"],
      "env": { "WHATAGENT_API_KEY": "${result.api_key}" }
    }
  }
}
\`\`\`

After saving the config, reload your AI tool. You can now use \`send_whatsapp_message\` to send WhatsApp messages.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Operational tool handlers
// ---------------------------------------------------------------------------

async function handleOperational(
  name: string,
  args: unknown,
  client: WhatAgent
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'send_whatsapp_message': {
        const { to, text } = z.object({ to: z.string(), text: z.string() }).parse(args);
        const result = await client.messages.send({ to, text });
        return {
          content: [
            {
              type: 'text',
              text: `Message sent!\n- ID: ${result.id}\n- Status: ${result.status}\n- To: ${result.to}\n- Meta ID: ${result.meta_message_id}`,
            },
          ],
        };
      }

      case 'send_whatsapp_template': {
        const { to, template_name, language } = z
          .object({ to: z.string(), template_name: z.string(), language: z.string().optional() })
          .parse(args);
        const result = await client.messages.send({
          to,
          template: { name: template_name, language: language ?? 'en_US' },
        });
        return {
          content: [
            {
              type: 'text',
              text: `Template message sent!\n- ID: ${result.id}\n- Template: ${template_name}\n- Status: ${result.status}`,
            },
          ],
        };
      }

      case 'get_message_status': {
        const { message_id } = z.object({ message_id: z.string() }).parse(args);
        const msg = await client.messages.get(message_id);
        const lines = [
          `Message ID: ${msg.id}`,
          `Status: ${msg.status}`,
          `To: ${msg.to_number ?? 'N/A'}`,
          `Type: ${msg.type}`,
          msg.sent_at ? `Sent: ${msg.sent_at}` : null,
          msg.delivered_at ? `Delivered: ${msg.delivered_at}` : null,
          msg.read_at ? `Read: ${msg.read_at}` : null,
          msg.error_message ? `Error: ${msg.error_message}` : null,
        ].filter(Boolean);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'list_recent_messages': {
        const { limit } = z.object({ limit: z.number().optional() }).parse(args ?? {});
        const result = await client.messages.list({ limit: limit ?? 10 });
        if (result.messages.length === 0) {
          return { content: [{ type: 'text', text: 'No messages found.' }] };
        }
        const rows = result.messages.map(
          (m) =>
            `[${m.created_at.slice(0, 10)}] ${m.status.padEnd(9)} ${m.direction === 'inbound' ? '←' : '→'} ${m.to_number ?? m.from_number ?? 'unknown'} | ${m.body?.slice(0, 50) ?? m.template_name ?? m.type}`
        );
        return {
          content: [
            {
              type: 'text',
              text: `Recent messages (${result.count}):\n\n${rows.join('\n')}`,
            },
          ],
        };
      }

      case 'configure_webhook': {
        const { webhook_url } = z.object({ webhook_url: z.string().url() }).parse(args);
        const response = await fetch(`${BASE_URL}/v1/accounts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': '@whatagent/mcp/1.0.0',
          },
          body: JSON.stringify({ webhook_url }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const errMsg =
            typeof body === 'object' && body !== null && 'error' in body
              ? String((body as { error: unknown }).error)
              : `HTTP ${response.status}`;
          throw new Error(errMsg);
        }
        return {
          content: [
            {
              type: 'text',
              text: `Webhook configured!\n\nURL: ${webhook_url}\n\nWhatAgent will POST to this URL when:\n- You receive an inbound WhatsApp message\n- A delivery status changes (sent/delivered/read/failed)\n\nExample payload:\n\`\`\`json\n{ "event": "message.received", "message": { "id": "msg_xxx", "from": "+14155552671", "type": "text", "text": "Hello!" } }\n\`\`\``,
            },
          ],
        };
      }

      case 'get_account': {
        const response = await fetch(`${BASE_URL}/v1/accounts/me`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': '@whatagent/mcp/1.0.0',
          },
        });
        if (response.status === 404) {
          return {
            content: [
              {
                type: 'text',
                text: 'No account configured yet. Use setup_whatagent to connect your WhatsApp Business account.',
              },
            ],
          };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const acc = (await response.json()) as {
          phone_number_id: string;
          waba_id: string;
          webhook_url: string | null;
          created_at: string;
        };
        return {
          content: [
            {
              type: 'text',
              text: [
                `Phone Number ID: ${acc.phone_number_id}`,
                `WABA ID: ${acc.waba_id}`,
                `Webhook URL: ${acc.webhook_url ?? '(not set — use configure_webhook to add one)'}`,
                `Connected since: ${acc.created_at.slice(0, 10)}`,
              ].join('\n'),
            },
          ],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message =
      err instanceof WhatAgentError
        ? `WhatAgent error (${err.status}): ${err.message}`
        : err instanceof Error
        ? err.message
        : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const isSetupMode = !apiKey;
const client = isSetupMode ? null : new WhatAgent({ apiKey: apiKey!, baseUrl: BASE_URL });

const server = new Server(
  { name: '@whatagent/mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isSetupMode ? SETUP_TOOLS : OPERATIONAL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (isSetupMode) {
    if (name === 'setup_whatagent') return handleSetup(args);
    return {
      content: [
        {
          type: 'text',
          text: 'WhatAgent is not configured. Call setup_whatagent (step="start") to get started.',
        },
      ],
      isError: true,
    };
  }

  return handleOperational(name, args, client!);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (isSetupMode) {
    console.error(
      '@whatagent/mcp: no API key found — running in setup mode. Call setup_whatagent to configure.'
    );
  } else {
    console.error('@whatagent/mcp server started');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
