"use client";

import { useCallback } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import type { ApiResult } from "@/shared/lib/api-response";

/**
 * Send a signed-out visitor to sign in, and bring them back where they were.
 *
 * Driven by the action's response rather than by an `isLoggedIn` prop threaded
 * through every card, badge and modal. That keeps the buttons stateless, and it
 * stays correct when a session expires mid-visit — which a prop captured at
 * render time would not.
 */
export function useLoginRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Returns true when the result was an auth failure and a redirect was
   * started, so callers can stop and skip their own error handling.
   */
  return useCallback(
    (result: ApiResult<unknown>): boolean => {
      if (result.ok || result.error.code !== "UNAUTHORIZED") return false;
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return true;
    },
    [router, pathname],
  );
}
