import type { PaymentProvider, PaymentProviderId } from "./types";
import { CodProvider } from "./providers/cod.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { PaymobProvider } from "./providers/paymob.provider";
import { Errors } from "@/shared/lib/errors";

/** Strategy registry — add a provider here and the whole flow picks it up. */
const providers: Record<PaymentProviderId, PaymentProvider | null> = {
  cod: new CodProvider(),
  stripe: new StripeProvider(),
  paymob: new PaymobProvider(),
  wallet: null, // implemented by the wallet service, not an external provider
};

export function getProvider(id: PaymentProviderId): PaymentProvider {
  const provider = providers[id];
  if (!provider) throw Errors.badRequest(`Unsupported payment provider: ${id}`);
  if (!provider.isEnabled()) throw Errors.badRequest(`${id} is not configured`);
  return provider;
}

/** Providers currently usable given the environment configuration. */
export function enabledProviders(): PaymentProviderId[] {
  return (Object.keys(providers) as PaymentProviderId[]).filter((id) => {
    const p = providers[id];
    return p != null && p.isEnabled();
  });
}
