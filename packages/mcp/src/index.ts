#!/usr/bin/env node
/**
 * @whatagent/mcp — MCP server for WhatAgent
 *
 * Exposes WhatsApp messaging as tools for Claude Code, Cursor, Windsurf,
 * and any other MCP-compatible AI coding environment.
 *
 * Configuration (env vars):
 *   WHATSAPP_ACCESS_TOKEN     — Meta Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID  — Phone Number ID from Meta Business Manager
 *
 * Usage in .mcp.json:
 *   {
 *     "mcpServers": {
 *       "whatagent": {
 *         "command": "npx",
 *         "args": ["-y", "@whatagent/mcp"],
 *         "env": {
 *           "WHATSAPP_ACCESS_TOKEN": "your-token",
 *           "WHATSAPP_PHONE_NUMBER_ID": "your-phone-id"
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WhatAgent } from 'whatagent';

function getAgent(): WhatAgent {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'Missing required env vars: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must both be set.'
    );
  }

  return new WhatAgent({ accessToken, phoneNumberId });
}

const server = new McpServer({
  name: '@whatagent/mcp',
  version: '0.1.0',
});

server.registerTool(
  'send_whatsapp_message',
  {
    title: 'Send WhatsApp Message',
    description:
      'Send a WhatsApp text message to a phone number. ' +
      'The recipient must be a registered WhatsApp user. ' +
      'Phone numbers must be in E.164 format (e.g. +14155552671).',
    inputSchema: z.object({
      to: z
        .string()
        .describe('Recipient phone number in E.164 format, e.g. +14155552671'),
      text: z.string().describe('The message text to send'),
    }),
  },
  async ({ to, text }) => {
    let agent: WhatAgent;
    try {
      agent = getAgent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Configuration error: ${msg}` }],
        isError: true,
      };
    }

    const result = await agent.sendMessage({ to, text });

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Message sent successfully. Message ID: ${result.messageId}`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Failed to send message: ${result.error}` }],
      isError: true,
    };
  }
);

server.registerTool(
  'check_whatsapp_config',
  {
    title: 'Check WhatsApp Configuration',
    description:
      'Verify that the WhatAgent MCP server is correctly configured with ' +
      'a valid access token and phone number ID. Use this to diagnose setup issues.',
    inputSchema: z.object({}),
  },
  async () => {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const lines: string[] = ['WhatAgent MCP Configuration Check', ''];

    if (accessToken) {
      lines.push(`WHATSAPP_ACCESS_TOKEN: set (${accessToken.length} chars)`);
    } else {
      lines.push('WHATSAPP_ACCESS_TOKEN: NOT SET');
    }

    if (phoneNumberId) {
      lines.push(`WHATSAPP_PHONE_NUMBER_ID: ${phoneNumberId}`);
    } else {
      lines.push('WHATSAPP_PHONE_NUMBER_ID: NOT SET');
    }

    const allSet = Boolean(accessToken && phoneNumberId);
    lines.push('');
    lines.push(allSet ? 'Status: Ready to send messages.' : 'Status: Configuration incomplete.');

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('@whatagent/mcp server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
