import Stripe from 'stripe';
import { User } from '../models/User';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export const stripeService = {
  async createCheckoutSession(userId: string, _tier = 'premium') {
    const stripe = getStripe();
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    let customerId = (user as any).stripeCustomerId as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user._id) },
      });
      customerId = customer.id;
      (user as any).stripeCustomerId = customerId;
      await user.save();
    }

    const priceId = process.env.STRIPE_PRICE_ID;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: 'usd',
              unit_amount: 299,
              product_data: {
                name: 'ReaganXS Premium',
                description: 'Desktop access + community models ($2.99)',
              },
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: lineItems,
      success_url: `${FRONTEND_URL}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/settings?cancelled=1`,
      metadata: { userId: String(user._id), tier: 'premium' },
    });

    return { url: session.url, sessionId: session.id };
  },

  async activatePremium(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    user.tier = 'premium';
    (user as any).tempPremiumExpiresAt = undefined;
    (user as any).premiumPaidAt = new Date();
    await user.save();
    return user;
  },

  async confirmSessionAndActivate(sessionId: string) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }
    const userId = session.metadata?.userId;
    if (!userId) throw new Error('Missing userId on session');
    return this.activatePremium(userId);
  },
};