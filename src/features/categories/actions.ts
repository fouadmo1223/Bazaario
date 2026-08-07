"use server";

import { revalidatePath } from "next/cache";
import { categoryService } from "@/server/services/category.service";
import { Vendor } from "@/server/database/models/vendor.model";
import { connectToDatabase } from "@/server/database/connection";
import { requireVendorPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { categoryInputSchema } from "./schemas";
import type { CategoryDoc } from "@/server/database/models/category.model";

function serialize(c: CategoryDoc) {
  return JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
}

/** The storefront folds vendor categories into marketplace-wide tiles and pages. */
async function revalidateStorefront(vendorId: string) {
  await connectToDatabase();
  const vendor = await Vendor.findById(vendorId).select("slug");
  if (vendor) revalidatePath(`/v/${vendor.slug}`);
  revalidatePath("/categories");
  revalidatePath("/categories/[slug]", "page");
  revalidatePath("/");
}

export async function createCategoryAction(
  vendorId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = categoryInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid category", parsed.error.flatten());

    const category = await categoryService.create(vendorId, parsed.data, user.id);
    revalidatePath("/dashboard/categories");
    await revalidateStorefront(vendorId);
    return ok(serialize(category), { message: "Category created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateCategoryAction(
  vendorId: string,
  categoryId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = categoryInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid category", parsed.error.flatten());

    const category = await categoryService.update(vendorId, categoryId, parsed.data, user.id);
    revalidatePath("/dashboard/categories");
    await revalidateStorefront(vendorId);
    return ok(serialize(category), { message: "Category updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteCategoryAction(
  vendorId: string,
  categoryId: string,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.PRODUCT_WRITE);
    await categoryService.remove(vendorId, categoryId, user.id);
    revalidatePath("/dashboard/categories");
    await revalidateStorefront(vendorId);
    return ok(null, { message: "Category deleted." });
  } catch (err) {
    return toFailure(err);
  }
}
