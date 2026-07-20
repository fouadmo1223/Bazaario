"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { wishlistService } from "@/server/services/wishlist.service";
import { cartService } from "@/server/services/cart.service";
import { getCurrentUser } from "@/server/security/current-user";
import { resolveCartOwner } from "@/server/security/guest-token";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

/**
 * Wishlist mutations.
 *
 * **A session is required to save anything**, matching the cart. Enforced here
 * rather than only on the heart button, because server actions are reachable by
 * direct POST. Reads stay guest-tolerant so an existing guest list is still
 * visible to whoever holds the cookie.
 */

const productRef = z.object({
  productId: z.string().regex(/^[0-9a-f]{24}$/i, "Invalid product"),
});

async function mutatingOwner() {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized("Sign in to save items");
  return resolveCartOwner(user.id, { create: true });
}

async function existingOwner() {
  const user = await getCurrentUser();
  const owner = await resolveCartOwner(user?.id);
  if (!owner.userId && !owner.guestToken) throw Errors.notFound("Your wishlist is empty");
  return owner;
}

export async function toggleWishlistAction(
  input: unknown,
): Promise<ApiResult<{ saved: boolean; count: number }>> {
  try {
    const parsed = productRef.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const owner = await mutatingOwner();
    const { list, saved } = await wishlistService.toggle(owner, parsed.data.productId);

    revalidatePath("/wishlist");
    return ok(
      { saved, count: list.items.length },
      { message: saved ? "Saved to wishlist." : "Removed from wishlist." },
    );
  } catch (err) {
    return toFailure(err);
  }
}

export async function removeFromWishlistAction(
  input: unknown,
): Promise<ApiResult<{ count: number }>> {
  try {
    const parsed = productRef.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid product", parsed.error.flatten());

    const owner = await existingOwner();
    const list = await wishlistService.remove(owner, parsed.data.productId);

    revalidatePath("/wishlist");
    return ok({ count: list.items.length }, { message: "Removed from wishlist." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function clearWishlistAction(): Promise<ApiResult<null>> {
  try {
    const owner = await existingOwner();
    await wishlistService.clear(owner);

    revalidatePath("/wishlist");
    return ok(null, { message: "Wishlist cleared." });
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Move a saved item into the cart.
 *
 * The cart is vendor-scoped while the wishlist is not, so the vendor comes from
 * the product itself rather than the caller. Only drops the item from the
 * wishlist once the cart add has actually succeeded — a stock rejection must not
 * lose the shopper's saved item.
 */
export async function moveToCartAction(
  input: unknown,
): Promise<ApiResult<{ count: number }>> {
  try {
    const parsed = z
      .object({
        productId: z.string().regex(/^[0-9a-f]{24}$/i, "Invalid product"),
        vendorId: z.string().regex(/^[0-9a-f]{24}$/i, "Invalid vendor"),
        vendorSlug: z.string().min(1),
      })
      .safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid item", parsed.error.flatten());

    const owner = await mutatingOwner();
    await cartService.addItem(parsed.data.vendorId, owner, {
      productId: parsed.data.productId,
      quantity: 1,
    });

    const list = await wishlistService.remove(owner, parsed.data.productId);

    revalidatePath("/wishlist");
    revalidatePath(`/v/${parsed.data.vendorSlug}/cart`);
    return ok({ count: list.items.length }, { message: "Moved to cart." });
  } catch (err) {
    return toFailure(err);
  }
}
