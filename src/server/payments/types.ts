import type { OrderDoc } from "@/server/database/models/order.model";

export type PaymentProviderId = "stripe" | "paymob" | "cod" | "wallet";

/** Result of initiating a payment for an order. */
export type PaymentInitResult = {
  provider: PaymentProviderId;
  /** For redirect/hosted flows (Stripe Checkout, Paymob iframe). */
  redirectUrl?: string;
  /** For client-confirmed flows (Stripe Payment Intent). */
  clientSecret?: string;
  /** Provider transaction/intent reference stored on the order. */
  reference?: string;
  /** True when no further action is needed (COD). */
  settled: boolean;
};

/** Normalized outcome parsed from a provider webhook. */
export type WebhookOutcome = {
  orderRef: string; // our order id or number carried in metadata
  status: "paid" | "failed" | "refunded";
  providerReference: string;
  amount?: number;
};

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  isEnabled(): boolean;
  /** Begin payment for an order. */
  initiate(order: OrderDoc, opts: { returnUrl: string }): Promise<PaymentInitResult>;
  /** Verify a webhook signature and normalize the event. Return null to ignore. */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome | null>;
}
