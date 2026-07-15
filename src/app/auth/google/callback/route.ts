import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { googleOAuth } from "@/server/services/google-oauth.service";
import { clientEnv } from "@/shared/config/env";
import { logger } from "@/shared/lib/logger";

/**
 * GET /auth/google/callback — Google redirects here with `code` + `state`.
 * Verifies the CSRF state cookie, exchanges the code, creates the session,
 * then redirects into the app.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = clientEnv.NEXT_PUBLIC_APP_URL;

  const jar = await cookies();
  const expectedState = jar.get("oauth_state")?.value;
  jar.delete("oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${base}/login?error=oauth_state`);
  }

  try {
    await googleOAuth.handleCallback(code);
    return NextResponse.redirect(`${base}/`);
  } catch (err) {
    logger.error({ err }, "Google callback failed");
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }
}
