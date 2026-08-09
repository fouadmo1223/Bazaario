import "server-only";
import { cookies } from "next/headers";

/**
 * Which vendor a super admin is currently operating the dashboard as.
 *
 * Scoped to a cookie rather than a query param so every existing dashboard
 * page — none of which thread a `vendorId` through today — keeps working
 * unmodified; `resolveActiveVendor` reads this itself when no explicit id is
 * passed. Meaningless for anyone but a super admin: `resolveActiveVendor`
 * only consults it on that branch.
 */
const VENDOR_OVERRIDE_COOKIE = "sa_vendor";

export async function getVendorOverride(): Promise<string | null> {
  return (await cookies()).get(VENDOR_OVERRIDE_COOKIE)?.value ?? null;
}

export async function setVendorOverride(vendorId: string | null): Promise<void> {
  const jar = await cookies();
  if (vendorId) {
    jar.set(VENDOR_OVERRIDE_COOKIE, vendorId, { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    jar.delete(VENDOR_OVERRIDE_COOKIE);
  }
}
