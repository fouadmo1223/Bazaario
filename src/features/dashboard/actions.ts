"use server";

import { requireSuperAdmin } from "@/server/security/current-user";
import { setVendorOverride } from "@/features/platform/vendor-switch";
import { revalidatePath } from "next/cache";

/** Switch which vendor a super admin's dashboard session operates as. */
export async function switchVendorAction(vendorId: string): Promise<void> {
  await requireSuperAdmin();
  await setVendorOverride(vendorId || null);
  revalidatePath("/dashboard");
}
