"use server";

import { productService } from "@/server/services/product.service";
import { requireVendorPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { revalidatePath } from "next/cache";
import { Vendor } from "@/server/database/models/vendor.model";
import {
  createProductSchema,
  updateProductSchema,
  variantMatrixSchema,
} from "./schemas";
import type { ProductDoc } from "@/server/database/models/product.model";

function serialize(p: ProductDoc) {
  return JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
}

/**
 * Refresh everywhere a product change is visible.
 *
 * These previously pointed at `/dashboard/${vendorId}/products`, a route that
 * does not exist — the dashboard resolves the vendor from the session rather
 * than the URL — so every one of them was a no-op.
 *
 * The storefront pages are ISR-cached, so without this a vendor publishes a
 * product and then watches a stale catalogue for up to a minute, with no way to
 * tell whether the save worked.
 */
async function revalidateProductViews(vendorId: string): Promise<void> {
  revalidatePath("/dashboard/products");

  const vendor = await Vendor.findById(vendorId).select("slug");
  if (vendor) {
    revalidatePath(`/v/${vendor.slug}`);
    revalidatePath(`/v/${vendor.slug}/p/[slug]`, "page");
  }

  // Marketplace-wide surfaces built from every vendor's catalogue.
  revalidatePath("/");
  revalidatePath("/products");
}

export async function createProductAction(
  vendorId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const product = await productService.create(vendorId, parsed.data, user.id);
    await revalidateProductViews(vendorId);
    return ok(serialize(product), { message: "Product created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateProductAction(
  vendorId: string,
  productId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = updateProductSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const product = await productService.update(vendorId, productId, parsed.data, user.id);
    await revalidateProductViews(vendorId);
    return ok(serialize(product), { message: "Product updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteProductAction(
  vendorId: string,
  productId: string,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    await productService.remove(vendorId, productId, user.id);
    await revalidateProductViews(vendorId);
    return ok(null, { message: "Product deleted." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function syncVariantsAction(
  vendorId: string,
  productId: string,
  input: unknown,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = variantMatrixSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid variants", parsed.error.flatten());

    await productService.syncVariants(vendorId, productId, parsed.data, user.id);
    await revalidateProductViews(vendorId);
    return ok(null, { message: "Variants updated." });
  } catch (err) {
    return toFailure(err);
  }
}
