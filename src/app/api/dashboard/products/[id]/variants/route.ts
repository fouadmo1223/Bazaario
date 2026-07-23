import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getVariantEditorData } from "@/features/products/queries";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { json, route } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

/**
 * A variable product's options and variant grid, for the dashboard matrix editor.
 *
 * Fetched on demand when a vendor opens the variants editor, rather than shipping
 * every variant of every product into the table. Guarded the same way as the
 * product-edit route: bound to the caller's own vendor, and the query is
 * vendor-scoped so another vendor's id resolves to nothing.
 */
export const GET = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) throw Errors.notFound("Product not found");

    const { vendor } = await resolveActiveVendor();
    await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);

    const data = await getVariantEditorData(String(vendor._id), id);
    if (!data) throw Errors.notFound("Product not found");

    return json(data);
  },
);
