"use server";

import { revalidatePath } from "next/cache";
import { cartService } from "@/server/services/cart.service";
import { getCurrentUser } from "@/server/security/current-user";
import { resolveCartOwner } from "@/server/security/guest-token";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema,
  applyCouponSchema,
} from "./schemas";

/**
 * Cart mutations.
 *
 * **A session is required to put anything in a cart.** This is a deliberate
 * product decision, not a technical one: the guest-cart machinery below still
 * works, and reverting means restoring the `{ create: true }` call.
 *
 * The check lives here rather than only on the buttons because server actions
 * are reachable by direct POST — a hidden button is not an access control.
 *
 * Reads of an existing cart stay guest-tolerant so that anyone who still holds
 * a guest cookie from before this change can see and clear what is in it,
 * rather than having a cart they cannot reach.
 *
 * Nothing here trusts client-supplied prices; the service re-reads them from
 * the product, and checkout re-prices everything again.
 */

/** Owner for a mutation. Requires a signed-in user. */
async function mutatingOwner() {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized("Sign in to add items to your cart");
  return resolveCartOwner(user.id, { create: true });
}

/**
 * Owner for a read/update of an existing cart. Never mints a token: if the
 * visitor has no session and no cookie, they cannot own a cart to touch.
 */
async function existingOwner() {
  const user = await getCurrentUser();
  const owner = await resolveCartOwner(user?.id);
  if (!owner.userId && !owner.guestToken) throw Errors.notFound("Your cart is empty");
  return owner;
}

/** Cart contents are per-visitor, so only this vendor's cart page needs busting. */
function revalidateCart(vendorSlug: string) {
  revalidatePath(`/v/${vendorSlug}/cart`);
}

export async function addToCartAction(
  vendorId: string,
  vendorSlug: string,
  input: unknown,
): Promise<ApiResult<{ itemCount: number }>> {
  try {
    const parsed = addToCartSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid cart item", parsed.error.flatten());

    const owner = await mutatingOwner();
    const cart = await cartService.addItem(vendorId, owner, parsed.data);

    revalidateCart(vendorSlug);
    return ok(
      { itemCount: cart.items.reduce((n, i) => n + i.quantity, 0) },
      { message: "Added to cart." },
    );
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateCartItemAction(
  vendorId: string,
  vendorSlug: string,
  input: unknown,
): Promise<ApiResult<{ itemCount: number }>> {
  try {
    const parsed = updateCartItemSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid quantity", parsed.error.flatten());

    const owner = await existingOwner();
    const cart = await cartService.updateItem(vendorId, owner, parsed.data);

    revalidateCart(vendorSlug);
    return ok({ itemCount: cart.items.reduce((n, i) => n + i.quantity, 0) });
  } catch (err) {
    return toFailure(err);
  }
}

export async function removeCartItemAction(
  vendorId: string,
  vendorSlug: string,
  input: unknown,
): Promise<ApiResult<{ itemCount: number }>> {
  try {
    const parsed = removeCartItemSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid cart item", parsed.error.flatten());

    const owner = await existingOwner();
    const cart = await cartService.removeItem(
      vendorId,
      owner,
      parsed.data.productId,
      parsed.data.variantId,
    );

    revalidateCart(vendorSlug);
    return ok(
      { itemCount: cart.items.reduce((n, i) => n + i.quantity, 0) },
      { message: "Item removed." },
    );
  } catch (err) {
    return toFailure(err);
  }
}

export async function clearCartAction(
  vendorId: string,
  vendorSlug: string,
): Promise<ApiResult<null>> {
  try {
    const owner = await existingOwner();
    await cartService.clear(vendorId, owner);

    revalidateCart(vendorSlug);
    return ok(null, { message: "Cart cleared." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function applyCouponAction(
  vendorId: string,
  vendorSlug: string,
  input: unknown,
): Promise<ApiResult<{ coupon: string }>> {
  try {
    const parsed = applyCouponSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid coupon", parsed.error.flatten());

    const owner = await existingOwner();
    const cart = await cartService.applyCoupon(vendorId, owner, parsed.data.code);

    revalidateCart(vendorSlug);
    return ok({ coupon: cart.coupon ?? "" }, { message: "Coupon applied." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function removeCouponAction(
  vendorId: string,
  vendorSlug: string,
): Promise<ApiResult<null>> {
  try {
    const owner = await existingOwner();
    await cartService.removeCoupon(vendorId, owner);

    revalidateCart(vendorSlug);
    return ok(null, { message: "Coupon removed." });
  } catch (err) {
    return toFailure(err);
  }
}
