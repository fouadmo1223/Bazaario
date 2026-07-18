import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getProductForEdit } from "@/features/products/queries";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { json, route } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

/**
 * One product, shaped for the dashboard edit form.
 *
 * Exists so the product table can ship only what it displays, and fetch the full
 * record on demand when a row is actually edited — rather than serialising every
 * field of every product into the page on the chance one gets opened.
 *
 * Guarded twice over: `resolveActiveVendor` binds the caller to their own
 * vendor, and `getProductForEdit` is vendor-scoped, so another vendor's product
 * id resolves to nothing rather than crossing the tenant boundary.
 */
export const GET = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) throw Errors.notFound("Product not found");

    const { vendor } = await resolveActiveVendor();
    await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);

    const product = await getProductForEdit(String(vendor._id), id);
    if (!product) throw Errors.notFound("Product not found");

    return json(product);
  },
);
