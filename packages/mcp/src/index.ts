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

const apiKey = process.env.WHATAGENT_API_KEY;
const baseUrl = process.env.WHATAGENT_BASE_URL;

if (!apiKey) {
  console.error('Error: WHATAGENT_API_KEY environment variable is required');
  process.exit(1);
}

const client = new WhatAgent({ apiKey, ...(baseUrl && { baseUrl }) });

const tools: Tool[] = [
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
    description: 'List recent WhatsApp messages sent from your account (newest first).',
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
];

const server = new Server(
  { name: '@whatagent/mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'send_whatsapp_message': {
        const { to, text } = z
          .object({ to: z.string(), text: z.string() })
          .parse(args);
        const result = await client.messages.send({ to, text });
        return {
          content: [
            {
              type: 'text',
              text: `Message sent successfully!\n- Message ID: ${result.id}\n- Status: ${result.status}\n- To: ${result.to}\n- Meta ID: ${result.meta_message_id}`,
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
              text: `Template message sent!\n- Message ID: ${result.id}\n- Template: ${template_name}\n- Status: ${result.status}`,
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
        const rows = result.messages.map((m) =>
          `[${m.created_at.slice(0, 10)}] ${m.status.padEnd(9)} → ${m.to_number ?? m.from_number ?? 'unknown'} | ${m.body?.slice(0, 50) ?? m.template_name ?? m.type}`
        );
        return {
          content: [{ type: 'text', text: `Recent messages (${result.count}):\n\n${rows.join('\n')}` }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof WhatAgentError
      ? `WhatAgent error (${err.status}): ${err.message}`
      : err instanceof Error
      ? err.message
      : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('@whatagent/mcp server started');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
