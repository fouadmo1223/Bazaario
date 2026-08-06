import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const {
  Link,
  redirect: intlRedirect,
  permanentRedirect,
  useRouter,
  usePathname,
  getPathname,
} = createNavigation(routing);

type RedirectArgs = Parameters<typeof intlRedirect>[0];
type RedirectType = Parameters<typeof intlRedirect>[1];

/**
 * Wraps next-intl's `redirect` with an explicit `never` return type.
 *
 * TypeScript's control-flow narrowing after `if (!x) redirect(...)` relies on
 * the callee's return type resolving to `never`; next-intl's own overloaded
 * signature doesn't reliably resolve that way at the call site (confirmed via
 * an isolated repro — `ReturnType<typeof intlRedirect>` reports `never`, but
 * narrowing still fails), so every caller was left treating `x` as possibly
 * null afterward. This wrapper's own explicit annotation fixes that for every
 * call site at once instead of patching each one.
 */
export function redirect(args: RedirectArgs, type?: RedirectType): never {
  intlRedirect(args, type);
  throw new Error("unreachable");
}
