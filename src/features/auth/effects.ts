import "server-only";
import type { AuthEffects } from "@/server/services/auth.service";
import { mailer } from "@/server/mail/mailer";
import { logger } from "@/shared/lib/logger";

/**
 * Wires the auth service's abstract effects to the real mail infrastructure.
 * Email failures are logged but never block the auth flow (the user can request
 * a resend), except where the flow explicitly depends on delivery.
 */
export const authEffects: AuthEffects = {
  async onVerificationToken(_userId, email, token) {
    try {
      await mailer.sendVerification(email, token);
    } catch (err) {
      logger.error({ err, email }, "Failed to send verification email");
    }
  },
  async onOtp(_userId, email, code) {
    await mailer.sendOtp(email, code); // OTP must deliver — let failures surface
  },
  async onPasswordResetToken(_userId, email, token) {
    try {
      await mailer.sendPasswordReset(email, token);
    } catch (err) {
      logger.error({ err, email }, "Failed to send password reset email");
    }
  },
};
