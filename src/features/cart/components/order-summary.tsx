import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/shared/lib/format";
import type { Totals } from "@/server/services/pricing.service";

/**
 * Money breakdown shared by the cart and checkout so the shopper sees the same
 * figures in both places. Server component — it only renders numbers the server
 * already computed.
 */
export async function OrderSummary({
  totals,
  currency,
  shippingKnown = false,
}: {
  totals: Totals;
  currency: string;
  /** Before a delivery method is chosen, shipping reads "calculated at checkout". */
  shippingKnown?: boolean;
}) {
  const t = await getTranslations("Checkout");
  const money = (n: number) => formatMoney(n, currency);

  return (
    <dl className="space-y-2 text-sm">
      <Row label={t("subtotal")} value={money(totals.subtotal)} />

      {totals.discount > 0 && (
        <Row
          label={t("discount")}
          value={`−${money(totals.discount)}`}
          className="text-emerald-600 dark:text-emerald-400"
        />
      )}

      {totals.tax > 0 && <Row label={t("tax")} value={money(totals.tax)} />}

      <Row
        label={t("shipping")}
        value={
          shippingKnown
            ? totals.shipping > 0
              ? money(totals.shipping)
              : t("free")
            : t("calculatedAtCheckout")
        }
        className={shippingKnown ? undefined : "text-zinc-500"}
      />

      <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
        <dt>{t("total")}</dt>
        <dd className="tabular-nums">{money(totals.grandTotal)}</dd>
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex justify-between text-zinc-600 dark:text-zinc-400 ${className ?? ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
