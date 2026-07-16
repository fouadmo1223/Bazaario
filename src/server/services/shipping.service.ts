import { Errors } from "@/shared/lib/errors";

/**
 * Shipping methods and their fees.
 *
 * Rates live on the server and are looked up by id. The checkout client sends a
 * method id, never a price — a client-supplied fee would flow straight into the
 * order total, so accepting one would let a shopper set their own shipping cost.
 *
 * TODO: per-vendor rate tables and zone/weight rules. Flat rates until then.
 */

export type ShippingMethodId = "standard" | "express";

export type ShippingMethod = {
  id: ShippingMethodId;
  label: string;
  description: string;
  /** Flat fee in the vendor's currency. */
  fee: number;
};

const METHODS: Record<ShippingMethodId, ShippingMethod> = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "3–5 business days",
    fee: 5,
  },
  express: {
    id: "express",
    label: "Express",
    description: "1–2 business days",
    fee: 15,
  },
};

/** Orders at or above this subtotal ship free on the standard method. */
const FREE_STANDARD_THRESHOLD = 100;

export function listShippingMethods(): ShippingMethod[] {
  return Object.values(METHODS);
}

export function isShippingMethodId(value: string): value is ShippingMethodId {
  return value in METHODS;
}

/**
 * Resolve the fee the order will actually be charged. `subtotal` is the
 * server-computed figure, never a client's claim about it.
 */
export function resolveShippingFee(methodId: string, subtotal: number): number {
  if (!isShippingMethodId(methodId)) throw Errors.badRequest("Unknown shipping method");

  const method = METHODS[methodId];
  if (method.id === "standard" && subtotal >= FREE_STANDARD_THRESHOLD) return 0;
  return method.fee;
}

/** Method list decorated with the fee this particular subtotal would pay. */
export function quoteShippingMethods(subtotal: number): (ShippingMethod & { quotedFee: number })[] {
  return listShippingMethods().map((m) => ({
    ...m,
    quotedFee: resolveShippingFee(m.id, subtotal),
  }));
}
