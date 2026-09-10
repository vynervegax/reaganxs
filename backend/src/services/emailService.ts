import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const emailService = {
  async sendPasswordResetEmail(email: string, resetLink: string) {
    await resend.emails.send({
      from: 'ReaganXS <noreply@reaganxs.com>',
      to: email,
      subject: 'Reset your ReaganXS password',
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset Your Password</h2>
          <p>You requested a password reset for your ReaganXS account.</p>
          <a href="${resetLink}" style="background: #00ff9f; color: black; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 16px 0;">
            Reset Password
          </a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn’t request this, please ignore this email.</p>
        </div>
      `,
    });
  },

  async sendWelcomeEmail(email: string, name: string) {
    await resend.emails.send({
      from: 'ReaganXS <welcome@reaganxs.com>',
      to: email,
      subject: 'Welcome to ReaganXS!',
      html: `<p>Hi ${name}, welcome to ReaganXS!</p>`,
    });
  },
};