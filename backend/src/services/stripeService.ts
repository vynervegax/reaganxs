import Stripe from 'stripe';
import { User } from '../models/User';
import { PREMIUM_PRICE_CENTS } from '../config/constants';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  // use your installed Stripe types’ latest API version, or omit if SDK defaults
  apiVersion: '2025-02-24.acacia' as any,
});

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

export const stripeService = {
  async createCheckoutSession(userId: string, _tier = 'premium') {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user._id) },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const priceId = process.env.STRIPE_PRICE_ID;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
  ? [{ price: priceId, quantity: 1 }] // Price ID only
  : [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 299, // $2.99 in cents — NOT the `price` field
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

  /** Call after successful payment (manual confirm or webhook) */
  async activatePremium(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    user.tier = 'premium';
    user.tempPremiumExpiresAt = undefined; // real pay overrides temp
    await user.save();
    return user;
  },

  async confirmSessionAndActivate(sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }
    const userId = session.metadata?.userId;
    if (!userId) throw new Error('Missing userId on session');
    return this.activatePremium(userId);
  },
};