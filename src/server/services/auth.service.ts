import { connectToDatabase } from "@/server/database/connection";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { issueOneTimeToken, consumeOneTimeToken } from "@/server/security/one-time-token";
import { createSession, destroySession } from "@/server/security/session";
import { Errors } from "@/shared/lib/errors";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { logger } from "@/shared/lib/logger";
import type {
  RegisterInput,
  LoginInput,
  ResetPasswordInput,
  OtpInput,
} from "@/features/auth/schemas";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: string;
  emailVerified: boolean;
  avatar: string | null;
};

function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    roles: u.roles as Role[],
    status: u.status,
    emailVerified: u.emailVerifiedAt != null,
    avatar: u.avatar ?? null,
  };
}

/**
 * Effects consumers wire up (email sending, etc.) so the service stays
 * decoupled from the mail infrastructure until that increment lands.
 */
export type AuthEffects = {
  onVerificationToken?: (userId: string, email: string, token: string) => Promise<void>;
  onOtp?: (userId: string, email: string, code: string) => Promise<void>;
  onPasswordResetToken?: (userId: string, email: string, token: string) => Promise<void>;
};

export const authService = {
  async register(input: RegisterInput, effects: AuthEffects = {}): Promise<PublicUser> {
    await connectToDatabase();

    const existing = await User.findOne({ email: input.email });
    if (existing) throw Errors.conflict("An account with this email already exists");

    const passwordHash = await hashPassword(input.password);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      roles: [ROLES.CUSTOMER],
      status: "pending",
    });

    const token = await issueOneTimeToken(String(user._id), "email_verify");
    await effects.onVerificationToken?.(String(user._id), user.email, token);

    logger.info({ userId: String(user._id) }, "User registered");
    return toPublicUser(user);
  },

  async login(input: LoginInput): Promise<PublicUser> {
    await connectToDatabase();

    // Need the hash, which is `select: false` by default.
    const user = await User.findOne({ email: input.email }).select("+passwordHash");
    if (!user || !user.passwordHash) throw Errors.unauthorized("Invalid email or password");
    if (user.status === "suspended") throw Errors.forbidden("This account is suspended");

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw Errors.unauthorized("Invalid email or password");

    user.lastLoginAt = new Date();
    await user.save();

    await createSession(
      { sub: String(user._id), email: user.email, roles: user.roles as Role[] },
      { rememberMe: input.rememberMe },
    );

    logger.info({ userId: String(user._id) }, "User logged in");
    return toPublicUser(user);
  },

  async logout(): Promise<void> {
    await destroySession();
  },

  async verifyEmail(token: string): Promise<void> {
    await connectToDatabase();
    const userId = await consumeOneTimeToken(token, "email_verify");
    await User.findByIdAndUpdate(userId, {
      $set: { emailVerifiedAt: new Date(), status: "active" },
    });
  },

  async requestPasswordReset(email: string, effects: AuthEffects = {}): Promise<void> {
    await connectToDatabase();
    const user = await User.findOne({ email });
    // Do not reveal whether the email exists.
    if (!user) return;
    const token = await issueOneTimeToken(String(user._id), "password_reset");
    await effects.onPasswordResetToken?.(String(user._id), user.email, token);
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await connectToDatabase();
    const userId = await consumeOneTimeToken(input.token, "password_reset");
    const passwordHash = await hashPassword(input.password);
    await User.findByIdAndUpdate(userId, { $set: { passwordHash } });
  },

  async requestOtp(email: string, effects: AuthEffects = {}): Promise<void> {
    await connectToDatabase();
    const user = await User.findOne({ email });
    if (!user) return;
    const code = await issueOneTimeToken(String(user._id), "otp");
    await effects.onOtp?.(String(user._id), user.email, code);
  },

  async verifyOtp(input: OtpInput): Promise<PublicUser> {
    await connectToDatabase();
    const userId = await consumeOneTimeToken(input.code, "otp");
    const user = await User.findById(userId);
    if (!user) throw Errors.notFound("User not found");

    await createSession({ sub: String(user._id), email: user.email, roles: user.roles as Role[] });
    return toPublicUser(user);
  },
};
