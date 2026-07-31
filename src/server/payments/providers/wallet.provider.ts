import type { PaymentProvider, PaymentInitResult } from "../types";

/**
 * The debit already happened synchronously in `checkout.service.createOrder`
 * — atomically alongside inventory reservation, before the order existed —
 * see `wallet.service.ts`. By the time anything would call `initiate()` the
 * order is already `payment.status: "paid"`, and `payment.service.initiate`
 * refuses to initiate an already-paid order, so this is a defensive no-op,
 * not the actual charge path. Unlike Stripe/Paymob there is no external
 * webhook source either.
 */
export class WalletProvider implements PaymentProvider {
  readonly id = "wallet" as const;

  isEnabled(): boolean {
    return true;
  }

  async initiate(): Promise<PaymentInitResult> {
    return { provider: "wallet", settled: true };
  }

  async parseWebhook(): Promise<null> {
    return null;
  }
}
