import nodemailer, { type Transporter } from "nodemailer";
import { getServerEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";

/**
 * Singleton nodemailer transport. Cached on globalThis so serverless warm
 * invocations reuse the SMTP pool instead of reconnecting per request.
 */
const globalForMail = globalThis as unknown as { _mailer?: Transporter };

export function getTransport(): Transporter {
  if (globalForMail._mailer) return globalForMail._mailer;

  const env = getServerEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error("SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD)");
  }

  const port = env.SMTP_PORT ?? 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
  });

  globalForMail._mailer = transport;
  logger.info({ host: env.SMTP_HOST, port }, "Mail transport initialized");
  return transport;
}
