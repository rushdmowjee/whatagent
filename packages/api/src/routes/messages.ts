import { Router, Response, Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AuthedRequest } from '../middleware/auth';
import { getDb } from '../db/client';
import { generateId, decrypt } from '../services/crypto';
import { sendTextMessage, sendTemplateMessage, sendImageMessage } from '../services/meta';
import { captureMessageSent } from '../services/analytics';
import { getPlanLimits } from '../services/plans';

export const messagesRouter = Router();

const sendSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text').default('text'),
    to: z.string().min(5),
    text: z.string().min(1).max(4096),
    preview_url: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('template'),
    to: z.string().min(5),
    template: z.object({
      name: z.string(),
      language: z.string().default('en_US'),
      components: z.array(z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal('image'),
    to: z.string().min(5),
    image: z.object({
      url: z.string().url(),
      caption: z.string().optional(),
    }),
  }),
]);

// POST /v1/messages — send a message
messagesRouter.post('/', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const parsed = sendSchema.safeParse({ type: 'text', ...req.body });
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const account = await db.query(
    `SELECT id, phone_number_id, access_token_encrypted, plan, messages_used, billing_cycle_start FROM accounts WHERE id = $1`,
    [authed.accountId]
  );

  if (account.rows.length === 0) {
    res.status(404).json({ error: 'Account not found. Complete onboarding first.' });
    return;
  }

  const { phone_number_id: phoneNumberId, access_token_encrypted, plan, billing_cycle_start, messages_used: rawMessagesUsed } = account.rows[0];

  // Reset monthly counter if billing cycle has rolled over (not for hobby — 500 is a lifetime total)
  const cycleStart = new Date(billing_cycle_start);
  const now = new Date();
  const cycleExpired = now >= new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate());
  let messagesUsed: number = parseInt(rawMessagesUsed, 10);
  if (cycleExpired && plan !== 'hobby') {
    await db.query(
      `UPDATE accounts SET messages_used = 0, billing_cycle_start = NOW() WHERE id = $1`,
      [authed.accountId]
    );
    messagesUsed = 0;
  }

  // Enforce message quota
  const limits = getPlanLimits(plan);
  if (isFinite(limits.messagesPerMonth) && messagesUsed >= limits.messagesPerMonth) {
    res.status(429).json({
      error: 'Message quota exceeded',
      plan,
      messages_used: messagesUsed,
      messages_limit: limits.messagesPerMonth,
      detail: plan === 'hobby'
        ? `Your hobby plan includes ${limits.messagesPerMonth.toLocaleString()} free messages in total. Upgrade at https://whatagent.dev/pricing.`
        : `Your ${plan} plan allows ${limits.messagesPerMonth.toLocaleString()} messages per month. Upgrade at https://whatagent.dev/pricing.`,
    });
    return;
  }

  const accessToken = decrypt(access_token_encrypted);
  const data = parsed.data;
  const messageId = generateId();

  try {
    let metaResponse;

    if (data.type === 'text') {
      metaResponse = await sendTextMessage({ phoneNumberId, accessToken, to: data.to, text: data.text, previewUrl: data.preview_url });
    } else if (data.type === 'template') {
      metaResponse = await sendTemplateMessage({ phoneNumberId, accessToken, to: data.to, templateName: data.template.name, languageCode: data.template.language, components: data.template.components });
    } else {
      metaResponse = await sendImageMessage({ phoneNumberId, accessToken, to: data.to, imageUrl: data.image.url, caption: data.image.caption });
    }

    const metaMessageId = metaResponse.messages[0]?.id;

    const prevCountResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM messages WHERE account_id = $1 AND direction = 'outbound'`,
      [authed.accountId]
    );
    const isFirst = parseInt(prevCountResult.rows[0].cnt, 10) === 0;

    await db.query(
      `INSERT INTO messages (id, account_id, direction, to_number, type, body, template_name, meta_message_id, status, sent_at, created_at, updated_at)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, 'sent', NOW(), NOW(), NOW())`,
      [messageId, authed.accountId, data.to, data.type, data.type === 'text' ? data.text : null, data.type === 'template' ? data.template.name : null, metaMessageId]
    );

    await db.query(`UPDATE accounts SET messages_used = messages_used + 1 WHERE id = $1`, [authed.accountId]);

    captureMessageSent(authed.accountId, isFirst, { message_type: data.type, to: data.to });

    res.status(201).json({ id: messageId, status: 'sent', to: data.to, meta_message_id: metaMessageId });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await db.query(
      `INSERT INTO messages (id, account_id, direction, to_number, type, body, status, error_message, created_at, updated_at)
       VALUES ($1, $2, 'outbound', $3, $4, $5, 'failed', $6, NOW(), NOW())`,
      [messageId, authed.accountId, data.to, data.type, data.type === 'text' ? data.text : null, errorMsg]
    );
    res.status(502).json({ id: messageId, status: 'failed', error: errorMsg });
  }
}) as RequestHandler);

// GET /v1/messages — list messages
messagesRouter.get('/', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const after = req.query.after as string | undefined;

  const db = getDb();
  const result = await db.query(
    `SELECT id, direction, to_number, from_number, type, body, template_name, meta_message_id, status, error_message, sent_at, delivered_at, read_at, created_at
     FROM messages
     WHERE account_id = $1 ${after ? 'AND created_at < (SELECT created_at FROM messages WHERE id = $3)' : ''}
     ORDER BY created_at DESC
     LIMIT $2`,
    after ? [authed.accountId, limit, after] : [authed.accountId, limit]
  );

  res.json({ messages: result.rows, count: result.rows.length });
}) as RequestHandler);

// GET /v1/messages/:id — get single message
messagesRouter.get('/:id', (async (req: Request, res: Response): Promise<void> => {
  const authed = req as AuthedRequest;
  const db = getDb();
  const result = await db.query(
    `SELECT id, direction, to_number, from_number, type, body, template_name, meta_message_id, status, error_message, sent_at, delivered_at, read_at, created_at
     FROM messages
     WHERE id = $1 AND account_id = $2`,
    [req.params.id, authed.accountId]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  res.json(result.rows[0]);
}) as RequestHandler);
