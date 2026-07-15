import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { googleOAuth } from "@/server/services/google-oauth.service";

/**
 * GET /auth/google — begins the OAuth flow.
 * Sets a short-lived, httpOnly `oauth_state` cookie for CSRF protection, then
 * redirects to Google's consent screen.
 */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(googleOAuth.buildAuthUrl(state));
}
