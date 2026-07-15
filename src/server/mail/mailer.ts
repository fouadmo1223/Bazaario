import { getTransport } from "./transport";
import { getServerEnv } from "@/shared/config/env";
import { clientEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";
import {
  verificationEmail,
  otpEmail,
  passwordResetEmail,
} from "@/emails/templates";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/** Low-level send. Returns the provider message id. */
export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<string> {
  const from = getServerEnv().MAIL_FROM;
  const info = await getTransport().sendMail({ from, to, subject, html, text });
  logger.info({ to, subject, messageId: info.messageId }, "Email sent");
  return info.messageId;
}

const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;

/** High-level, purpose-built senders used by the auth service effects. */
export const mailer = {
  async sendVerification(to: string, token: string): Promise<void> {
    const link = `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = verificationEmail({ link });
    await sendMail({ to, subject, html, text });
  },

  async sendOtp(to: string, code: string): Promise<void> {
    const { subject, html, text } = otpEmail({ code });
    await sendMail({ to, subject, html, text });
  },

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = passwordResetEmail({ link });
    await sendMail({ to, subject, html, text });
  },
};
