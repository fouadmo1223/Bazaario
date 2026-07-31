"use server";

import { Cart } from "@/server/database/models/cart.model";
import { connectToDatabase } from "@/server/database/connection";
import { checkoutService } from "@/server/services/checkout.service";
import { paymentService } from "@/server/services/payment.service";
import { resolveShippingFee } from "@/server/services/shipping.service";
import { getCurrentUser } from "@/server/security/current-user";
import { resolveCartOwner } from "@/server/security/guest-token";
import { grantOrderAccess } from "@/server/security/order-access";
import { clientEnv } from "@/shared/config/env";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { checkoutSchema } from "./schemas";

export type PlaceOrderResult = {
  orderId: string;
  number: string;
  /** Present for hosted flows (Stripe Checkout, Paymob iframe) — send the shopper here. */
  redirectUrl?: string;
  /** Where to land when there is nothing to redirect to (COD). */
  confirmationUrl: string;
};

/**
 * Place an order and begin payment.
 *
 * The client picks a shipping *method* and a payment *provider*; every amount is
 * derived server-side. `checkoutService` re-prices each line from the product
 * documents, so the cart's snapshotted prices cannot be used to underpay.
 */
export async function placeOrderAction(
  vendorId: string,
  vendorSlug: string,
  input: unknown,
): Promise<ApiResult<PlaceOrderResult>> {
  try {
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Please check your details", parsed.error.flatten());

    const user = await getCurrentUser();
    const owner = await resolveCartOwner(user?.id);
    if (!owner.userId && !owner.guestToken) throw Errors.badRequest("Your cart is empty");

    const { address, shippingMethod, paymentProvider } = parsed.data;
    const guestEmail = parsed.data.guestEmail?.trim() || undefined;
    if (!user && !guestEmail) throw Errors.badRequest("Email is required for guest checkout");

    // Price the shipping method against the server's own view of the subtotal,
    // so a tampered cart or fee in the payload changes nothing.
    await connectToDatabase();
    const cart = await Cart.findOne(
      owner.userId ? { vendor: vendorId, user: owner.userId } : { vendor: vendorId, guestToken: owner.guestToken },
    );
    if (!cart || cart.items.length === 0) throw Errors.badRequest("Your cart is empty");

    const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const shippingBase = resolveShippingFee(shippingMethod, subtotal);

    const order = await checkoutService.createOrder(vendorId, owner, {
      paymentProvider,
      shippingMethod,
      shippingBase,
      address: {
        ...address,
        line2: address.line2 || undefined,
        region: address.region || undefined,
        postalCode: address.postalCode || undefined,
      },
      ...(guestEmail ? { guestEmail } : {}),
    });

    const orderId = String(order._id);
    const confirmationUrl = `/v/${vendorSlug}/order/${orderId}`;

    // Let this visitor read the order they just placed (guests have no account
    // to be checked against).
    await grantOrderAccess(orderId);

    // The order exists and stock is reserved. If starting payment fails, say so
    // without discarding the order — it is recoverable from the orders list.
    //
    // Wallet is already fully captured by this point (checkoutService debits
    // it synchronously) — initiate() would just throw "already paid", so it's
    // skipped rather than treated as a failure.
    let redirectUrl: string | undefined;
    if (order.payment.status !== "paid") {
      try {
        const init = await paymentService.initiate(
          orderId,
          new URL(confirmationUrl, clientEnv.NEXT_PUBLIC_APP_URL).toString(),
        );
        redirectUrl = init.redirectUrl;
      } catch (err) {
        logger.error({ err, orderId }, "Order placed but payment initiation failed");
        return ok(
          { orderId, number: order.number, confirmationUrl },
          { message: "Order placed, but payment could not be started. You can retry payment from the order." },
        );
      }
    }

    return ok({
      orderId,
      number: order.number,
      ...(redirectUrl ? { redirectUrl } : {}),
      confirmationUrl,
    });
  } catch (err) {
    return toFailure(err);
  }
}
