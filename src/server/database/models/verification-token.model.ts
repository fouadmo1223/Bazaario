import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

/**
 * One-time tokens for email verification, password reset, and OTP login.
 * Stored hashed (never the raw value). A TTL index auto-expires them.
 */
const verificationTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["email_verify", "password_reset", "otp"],
      required: true,
      index: true,
    },
    // SHA-256 of the raw token/OTP the user receives — we never store the plaintext.
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// TTL: Mongo removes the doc once expiresAt passes.
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationTokenDoc = InferSchemaType<typeof verificationTokenSchema> & {
  _id: Schema.Types.ObjectId;
};

export const VerificationToken: Model<VerificationTokenDoc> =
  (models.VerificationToken as Model<VerificationTokenDoc>) ??
  model<VerificationTokenDoc>("VerificationToken", verificationTokenSchema);
