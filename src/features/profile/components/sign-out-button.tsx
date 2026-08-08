"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/features/auth/actions";

/**
 * Sign out.
 *
 * `logoutAction` has existed since auth was built but was wired to nothing, so
 * there was no way to end a session from the UI at all — on a shared machine
 * the only way out was clearing cookies by hand.
 *
 * `router.refresh()` after the push matters: the session cookie is gone, but
 * the client router still holds cached Server Component payloads rendered for
 * the signed-in user, and without the refresh those keep showing until
 * something else invalidates them.
 */
export function SignOutButton() {
  const t = useTranslations("Account");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          router.push("/");
          router.refresh();
        })
      }
      className="rounded-xl border border-border-default px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-raised disabled:opacity-50"
    >
      {pending ? t("signingOut") : t("signOut")}
    </button>
  );
}
