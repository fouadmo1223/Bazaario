"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
      className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
