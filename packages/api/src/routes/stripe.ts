import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import { getDb } from '../db/client';
import { planFromStripePriceId } from '../services/plans';

export const stripeRouter = Router();

// POST /v1/webhooks/stripe — receive Stripe subscription events
stripeRouter.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secret && sig) {
    // Stripe uses a timestamp-based HMAC — verify it
    const rawBody = req.body as Buffer;
    const parts = sig.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const signatures = Object.entries(parts)
      .filter(([k]) => k === 'v1')
      .map(([, v]) => v);

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    if (!signatures.includes(expected)) {
      res.status(401).json({ error: 'Invalid Stripe signature' });
      return;
    }

    // Reject events older than 5 minutes to prevent replay attacks
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (age > 300) {
      res.status(400).json({ error: 'Webhook timestamp too old' });
      return;
    }
  }

  const event = JSON.parse(
    Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body)
  );

  res.status(200).json({ received: true });

  processStripeEvent(event).catch(console.error);
});

async function processStripeEvent(event: StripeEvent): Promise<void> {
  const db = getDb();

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const subscription = event.data.object as StripeSubscription;
    const customerId = subscription.customer;
    const priceId = subscription.items?.data?.[0]?.price?.id;

    if (!priceId) return;

    const plan = planFromStripePriceId(priceId);
    if (!plan) {
      console.warn(`Stripe: unknown price ID ${priceId} — skipping plan update`);
      return;
    }

    await db.query(
      `UPDATE accounts SET plan = $1, updated_at = NOW() WHERE stripe_customer_id = $2`,
      [plan, customerId]
    );
    console.log(`Stripe: updated plan to '${plan}' for customer ${customerId}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as StripeSubscription;
    const customerId = subscription.customer;

    // Downgrade to hobby on cancellation
    await db.query(
      `UPDATE accounts SET plan = 'hobby', updated_at = NOW() WHERE stripe_customer_id = $1`,
      [customerId]
    );
    console.log(`Stripe: subscription cancelled — reverted to hobby for customer ${customerId}`);
  }
}

interface StripeEvent {
  type: string;
  data: { object: unknown };
}

interface StripeSubscription {
  customer: string;
  items?: { data?: Array<{ price?: { id: string } }> };
}
