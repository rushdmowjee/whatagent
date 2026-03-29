import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import axios from 'axios';
import { getDb } from '../db/client';
import { generateId } from '../services/crypto';

export const webhooksRouter = Router();

// GET /v1/webhooks/meta — Meta webhook verification challenge
webhooksRouter.get('/meta', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN || 'whatagent_verify_2024';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verification failed' });
});

// POST /v1/webhooks/meta — receive inbound messages and status updates
webhooksRouter.post('/meta', async (req: Request, res: Response): Promise<void> => {
  // Verify signature (Meta sends X-Hub-Signature-256)
  const signature = req.headers['x-hub-signature-256'] as string;
  const appSecret = process.env.META_APP_SECRET;

  if (appSecret && signature) {
    const rawBody = req.body as Buffer;
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
    if (signature !== expected) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  // Respond 200 immediately — Meta expects fast ack
  res.status(200).json({ status: 'ok' });

  // Process asynchronously
  const payload = JSON.parse(
    Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)
  );

  processWebhookPayload(payload).catch(console.error);
});

async function processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  const db = getDb();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // Handle inbound messages
      for (const message of value.messages ?? []) {
        const phoneNumberId = value.metadata?.phone_number_id;

        // Find account by phone_number_id
        const account = await db.query(
          `SELECT id, webhook_url FROM accounts WHERE phone_number_id = $1`,
          [phoneNumberId]
        );
        if (account.rows.length === 0) continue;

        const { id: accountId, webhook_url: webhookUrl } = account.rows[0];
        const messageId = generateId();

        // Store inbound message
        await db.query(
          `INSERT INTO messages (id, account_id, direction, from_number, type, body, meta_message_id, status, created_at, updated_at)
           VALUES ($1, $2, 'inbound', $3, $4, $5, $6, 'received', NOW(), NOW())
           ON CONFLICT (meta_message_id) DO NOTHING`,
          [
            messageId,
            accountId,
            message.from,
            message.type,
            message.text?.body ?? null,
            message.id,
          ]
        );

        // Fan out to developer webhook
        if (webhookUrl) {
          const webhookPayload = {
            event: 'message.received',
            message: {
              id: messageId,
              from: message.from,
              type: message.type,
              text: message.text?.body,
              timestamp: message.timestamp,
            },
          };
          axios.post(webhookUrl, webhookPayload, { timeout: 5000 }).catch(() => {});
        }
      }

      // Handle status updates
      for (const status of value.statuses ?? []) {
        const statusMap: Record<string, string> = {
          sent: 'sent',
          delivered: 'delivered',
          read: 'read',
          failed: 'failed',
        };
        const newStatus = statusMap[status.status] ?? status.status;
        const timestampField =
          status.status === 'delivered'
            ? 'delivered_at'
            : status.status === 'read'
            ? 'read_at'
            : null;

        const updateSql = timestampField
          ? `UPDATE messages SET status = $1, ${timestampField} = TO_TIMESTAMP($2::bigint), updated_at = NOW() WHERE meta_message_id = $3`
          : `UPDATE messages SET status = $1, updated_at = NOW() WHERE meta_message_id = $3`;

        await db
          .query(updateSql, [newStatus, status.timestamp, status.id])
          .catch(console.error);
      }
    }
  }
}

interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id: string; display_phone_number: string };
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          timestamp: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
    }>;
  }>;
}
