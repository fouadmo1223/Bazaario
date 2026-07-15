"use server";

import { productService } from "@/server/services/product.service";
import { requireMarketPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { revalidatePath } from "next/cache";
import {
  createProductSchema,
  updateProductSchema,
  variantInputSchema,
} from "./schemas";
import { z } from "zod";
import type { ProductDoc } from "@/server/database/models/product.model";

function serialize(p: ProductDoc) {
  return JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
}

export async function createProductAction(
  marketId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireMarketPermission(marketId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const product = await productService.create(marketId, parsed.data, user.id);
    revalidatePath(`/dashboard/${marketId}/products`);
    return ok(serialize(product), { message: "Product created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateProductAction(
  marketId: string,
  productId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireMarketPermission(marketId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = updateProductSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const product = await productService.update(marketId, productId, parsed.data, user.id);
    revalidatePath(`/dashboard/${marketId}/products`);
    return ok(serialize(product), { message: "Product updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteProductAction(
  marketId: string,
  productId: string,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireMarketPermission(marketId, PERMISSIONS.PRODUCT_WRITE);
    await productService.remove(marketId, productId, user.id);
    revalidatePath(`/dashboard/${marketId}/products`);
    return ok(null, { message: "Product deleted." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function syncVariantsAction(
  marketId: string,
  productId: string,
  variants: unknown,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireMarketPermission(marketId, PERMISSIONS.PRODUCT_WRITE);
    const parsed = z.array(variantInputSchema).safeParse(variants);
    if (!parsed.success) throw Errors.validation("Invalid variants", parsed.error.flatten());

    await productService.syncVariants(marketId, productId, parsed.data, user.id);
    revalidatePath(`/dashboard/${marketId}/products/${productId}`);
    return ok(null, { message: "Variants updated." });
  } catch (err) {
    return toFailure(err);
  }
}
