import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'ReaganXS <noreply@reaganxs.com>';

export async function sendVerificationEmail(email: string, verifyLink: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY missing — skip verification email');
    return { sent: false };
  }

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your ReaganXS account',
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Confirm this address to finish setting up ReaganXS.</p>
        <a href="${verifyLink}" style="background:#f97316;color:#000;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:16px 0;">
          Verify email
        </a>
      </div>
    `,
  });

  return { sent: true };
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY missing — skip reset email');
    return { sent: false };
  }

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your ReaganXS password',
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>You requested a password reset for your ReaganXS account.</p>
        <a href="${resetLink}" style="background:#f97316;color:#000;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;margin:16px 0;">
          Reset Password
        </a>
        <p>This link will expire in 1 hour.</p>
      </div>
    `,
  });

  return { sent: true };
}

export async function sendWelcomeEmail(email: string, name: string) {
  if (!process.env.RESEND_API_KEY) return { sent: false };

  await resend.emails.send({
    from: process.env.EMAIL_FROM_WELCOME || FROM,
    to: email,
    subject: 'Welcome to ReaganXS!',
    html: `<p>Hi ${name || 'there'}, welcome to ReaganXS!</p>`,
  });

  return { sent: true };
}

export const emailService = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
};