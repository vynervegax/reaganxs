import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.string().optional(),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);