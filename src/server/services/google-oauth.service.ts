import { connectToDatabase } from "@/server/database/connection";
import { User } from "@/server/database/models/user.model";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { createSession } from "@/server/security/session";
import { logger } from "@/shared/lib/logger";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

type GoogleProfile = {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
};

function requireConfig() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw Errors.badRequest("Google login is not configured");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_CALLBACK_URL,
  };
}

export const googleOAuth = {
  /** Build the consent-screen URL. `state` is a CSRF token stored in a cookie. */
  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = requireConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  /** Exchange the auth code, fetch the profile, upsert the user, create a session. */
  async handleCallback(code: string): Promise<{ id: string; email: string; roles: Role[] }> {
    const { clientId, clientSecret, redirectUri } = requireConfig();

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      logger.error({ status: tokenRes.status }, "Google token exchange failed");
      throw Errors.unauthorized("Google sign-in failed");
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) throw Errors.unauthorized("Could not read Google profile");
    const profile = (await profileRes.json()) as GoogleProfile;

    if (!profile.email || !profile.verified_email) {
      throw Errors.badRequest("Your Google email is not verified");
    }

    await connectToDatabase();
    const email = profile.email.toLowerCase();
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name: profile.name ?? email.split("@")[0],
        avatar: profile.picture ?? null,
        roles: [ROLES.CUSTOMER],
        status: "active",
        emailVerifiedAt: new Date(), // Google-verified
        providers: [{ provider: "google", sub: profile.id }],
      });
    } else if (!user.providers.some((p) => p.provider === "google")) {
      user.providers.push({ provider: "google", sub: profile.id });
      if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
      if (user.status === "pending") user.status = "active";
      await user.save();
    }

    await createSession({
      sub: String(user._id),
      email: user.email,
      roles: user.roles as Role[],
    });

    logger.info({ userId: String(user._id) }, "Google sign-in");
    return { id: String(user._id), email: user.email, roles: user.roles as Role[] };
  },
};
