import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { authService } from "@/server/services/auth.service";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = { title: "Verify email · Bazaario" };

/**
 * Server Component: consumes the verification token on load. Because this runs
 * on GET, the token is single-use and idempotency is handled by the service
 * (a second click shows "invalid or already used").
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let status: "success" | "error" | "missing" = "missing";
  let message = "No verification token was provided.";

  if (token) {
    const result = await authService.verifyEmail(token).then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    if (result.ok) {
      status = "success";
      message = "Your email has been verified. Your account is now active.";
    } else {
      status = "error";
      message = isAppError(result.err)
        ? result.err.message
        : "This verification link is invalid or has expired.";
    }
  }

  const success = status === "success";
  return (
    <AuthShell title={success ? "Email verified" : "Verification failed"}>
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          success
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        }`}
      >
        {message}
      </div>
      <Link
        href={success ? "/login" : "/register"}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        {success ? "Continue to sign in" : "Back to sign up"}
      </Link>
    </AuthShell>
  );
}
