export type Plan = 'hobby' | 'developer' | 'scale' | 'business' | 'enterprise';

export interface PlanLimits {
  messagesPerMonth: number;
  numbers: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  hobby:      { messagesPerMonth: 2_000,       numbers: 1 },
  developer:  { messagesPerMonth: 100_000,     numbers: 3 },
  scale:      { messagesPerMonth: 500_000,     numbers: 10 },
  business:   { messagesPerMonth: 2_000_000,   numbers: 30 },
  enterprise: { messagesPerMonth: Infinity,    numbers: Infinity },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.hobby;
}

// Map Stripe price IDs to plan names. Set these env vars in your deployment.
// e.g. STRIPE_PRICE_DEVELOPER=price_xxx
export function planFromStripePriceId(priceId: string): Plan | null {
  const map: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_DEVELOPER ?? '']: 'developer',
    [process.env.STRIPE_PRICE_SCALE ?? '']:     'scale',
    [process.env.STRIPE_PRICE_BUSINESS ?? '']:  'business',
    [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
  };
  return map[priceId] ?? null;
}
