"use server";

import { marketService, createMarketSchema } from "@/server/services/market.service";
import { requireSuperAdmin } from "@/server/security/current-user";
import { writeAudit } from "@/server/services/audit.service";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { revalidatePath } from "next/cache";
import type { MarketDoc } from "@/server/database/models/market.model";

/** Platform (Super Admin) server actions. Every one asserts super_admin first. */

function serialize(m: MarketDoc) {
  return JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
}

export async function createMarketAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = createMarketSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw Errors.validation("Check the fields", parsed.error.flatten());

    const market = await marketService.create(parsed.data, admin.id);
    revalidatePath("/platform/markets");
    return ok(serialize(market), { message: "Market created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function suspendMarketAction(
  marketId: string,
  suspend: boolean,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const market = await marketService.suspend(marketId, admin.id, suspend);
    revalidatePath("/platform/markets");
    return ok(serialize(market));
  } catch (err) {
    return toFailure(err);
  }
}

export async function reassignMarketAdminAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const marketId = String(formData.get("marketId") ?? "");
    const email = String(formData.get("ownerEmail") ?? "");
    if (!marketId || !email) throw Errors.badRequest("Market and new owner email are required");

    const market = await marketService.reassignAdmin(marketId, email, admin.id);
    await writeAudit({ actor: admin.id, action: "market.reassign_admin.request", entity: "Market", entityId: marketId });
    revalidatePath("/platform/markets");
    return ok(serialize(market), { message: "Market admin reassigned." });
  } catch (err) {
    return toFailure(err);
  }
}
