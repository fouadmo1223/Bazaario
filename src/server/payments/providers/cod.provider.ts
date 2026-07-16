import type { PaymentProvider, PaymentInitResult } from "../types";

/** Cash on Delivery: nothing to charge now; captured on delivery. Always enabled. */
export class CodProvider implements PaymentProvider {
  readonly id = "cod" as const;

  isEnabled(): boolean {
    return true;
  }

  async initiate(): Promise<PaymentInitResult> {
    return { provider: "cod", settled: false };
  }

  async parseWebhook(): Promise<null> {
    return null; // COD has no webhooks
  }
}
