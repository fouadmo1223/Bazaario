"use server";

import { authService } from "@/server/services/auth.service";
import { authEffects } from "./effects";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  otpSchema,
} from "./schemas";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { absorbGuestCart } from "./guest-cart-merge";
import { headers } from "next/headers";
import type { PublicUser } from "@/server/services/auth.service";

/**
 * Auth Server Actions. Each is independently guarded (they're reachable via
 * direct POST) and returns the stable ApiResult contract. Forms consume these
 * via `useActionState`.
 */

async function clientKey(scope: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${ip}`;
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { flatten: () => unknown } } }, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Errors.validation("Please check the highlighted fields", result.error!.flatten());
  }
  return result.data as T;
}

function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}


export async function registerAction(_prev: unknown, formData: FormData): Promise<ApiResult<PublicUser>> {
  try {
    await rateLimit(await clientKey("register"), { max: 5, windowSec: 600 });
    const input = parse(registerSchema, formToObject(formData));
    const user = await authService.register(input, authEffects);
    return ok(user, { message: "Check your email to verify your account." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function loginAction(_prev: unknown, formData: FormData): Promise<ApiResult<PublicUser>> {
  try {
    await rateLimit(await clientKey("login"), { max: 10, windowSec: 300 });
    const input = parse(loginSchema, formToObject(formData));
    const user = await authService.login(input);
    await absorbGuestCart(user.id);
    return ok(user);
  } catch (err) {
    return toFailure(err);
  }
}

export async function logoutAction(): Promise<ApiResult<null>> {
  try {
    await authService.logout();
    return ok(null);
  } catch (err) {
    return toFailure(err);
  }
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  try {
    await rateLimit(await clientKey("forgot"), { max: 5, windowSec: 900 });
    const input = parse(forgotPasswordSchema, formToObject(formData));
    await authService.requestPasswordReset(input.email, authEffects);
    // Always success — do not reveal account existence.
    return ok(null, { message: "If that email exists, a reset link is on its way." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function resetPasswordAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  try {
    const input = parse(resetPasswordSchema, formToObject(formData));
    await authService.resetPassword(input);
    return ok(null, { message: "Password updated. You can now sign in." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function verifyEmailAction(token: string): Promise<ApiResult<null>> {
  try {
    const input = verifyEmailSchema.parse({ token });
    await authService.verifyEmail(input.token);
    return ok(null, { message: "Email verified. Welcome!" });
  } catch (err) {
    return toFailure(err);
  }
}

export async function requestOtpAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  try {
    await rateLimit(await clientKey("otp"), { max: 5, windowSec: 600 });
    const email = String(formData.get("email") ?? "");
    await authService.requestOtp(email, authEffects);
    return ok(null, { message: "If that email exists, a code has been sent." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function verifyOtpAction(_prev: unknown, formData: FormData): Promise<ApiResult<PublicUser>> {
  try {
    const input = parse(otpSchema, formToObject(formData));
    const user = await authService.verifyOtp(input);
    await absorbGuestCart(user.id);
    return ok(user);
  } catch (err) {
    return toFailure(err);
  }
}
