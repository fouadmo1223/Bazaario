"use server";

import { revalidatePath } from "next/cache";
import { walletService } from "@/server/services/wallet.service";
import { requireVendorPermission, requireUser } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { clientEnv } from "@/shared/config/env";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

/**
 * Vendor staff crediting a customer's platform-wide wallet — e.g. as an
 * alternative to a cash refund, or a goodwill gesture. Gated on the same
 * `ORDER_REFUND` permission as issuing an actual refund: this moves the same
 * kind of value, just as store credit instead of cash.
 */
export async function creditWalletAction(
  vendorId: string,
  orderId: string,
  customerId: string,
  amount: number,
  reason?: string,
): Promise<ApiResult<{ balance: number }>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.ORDER_REFUND);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Errors.badRequest("Enter an amount greater than zero");
    }

    await walletService.credit(customerId, amount, reason?.trim() || "Store credit", user.id);
    const balance = await walletService.getBalance(customerId);

    revalidatePath(`/dashboard/orders/${orderId}`);
    return ok({ balance }, { message: "Wallet credited." });
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Customer starting a card top-up. Returns a Stripe Checkout URL to redirect
 * to — the balance doesn't change until the webhook confirms payment
 * (`walletService.applyTopUpWebhook`); the browser return is never trusted.
 */
export async function initiateTopUpAction(amount: number): Promise<ApiResult<{ url: string }>> {
  try {
    const user = await requireUser();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Errors.badRequest("Enter an amount greater than zero");
    }

    const returnUrl = new URL("/account/wallet", clientEnv.NEXT_PUBLIC_APP_URL).toString();
    const { url } = await walletService.initiateTopUp(user.id, amount, returnUrl);
    return ok({ url });
  } catch (err) {
    return toFailure(err);
  }
}
