import { createHash, randomBytes, randomInt } from "node:crypto";
import { VerificationToken } from "@/server/database/models/verification-token.model";
import { Errors } from "@/shared/lib/errors";

type TokenType = "email_verify" | "password_reset" | "otp";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const TTL_MS: Record<TokenType, number> = {
  email_verify: 24 * 60 * 60 * 1000, // 24h
  password_reset: 60 * 60 * 1000, // 1h
  otp: 10 * 60 * 1000, // 10m
};

/**
 * Issue a one-time token. Returns the RAW value to send to the user; only the
 * hash is persisted. For OTP the raw value is a 6-digit code.
 */
export async function issueOneTimeToken(userId: string, type: TokenType): Promise<string> {
  const raw = type === "otp" ? String(randomInt(0, 1_000_000)).padStart(6, "0") : randomBytes(32).toString("hex");

  // Invalidate any outstanding tokens of the same type for this user.
  await VerificationToken.updateMany(
    { user: userId, type, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  await VerificationToken.create({
    user: userId,
    type,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + TTL_MS[type]),
  });

  return raw;
}

/**
 * Verify and consume a one-time token. Throws on invalid/expired/exhausted.
 * Returns the associated userId.
 */
export async function consumeOneTimeToken(raw: string, type: TokenType): Promise<string> {
  const record = await VerificationToken.findOne({
    tokenHash: sha256(raw),
    type,
    consumedAt: null,
  });

  if (!record) throw Errors.badRequest("Invalid or already-used token");
  if (record.expiresAt.getTime() < Date.now()) throw Errors.badRequest("Token has expired");
  if (record.attempts >= 5) throw Errors.rateLimited("Too many attempts");

  record.consumedAt = new Date();
  await record.save();
  return String(record.user);
}
