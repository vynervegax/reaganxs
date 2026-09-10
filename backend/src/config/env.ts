import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z.string(),
  RESEND_API_KEY: z.string(),
  STRIPE_SECRET_KEY: z.string(),        // ← Added
  STRIPE_PUBLISHABLE_KEY: z.string(),   // ← Added
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);