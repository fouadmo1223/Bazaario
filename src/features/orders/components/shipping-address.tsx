import { useTranslations } from "next-intl";

type Address = {
  recipient: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

/**
 * Renders a delivery address. Every field is optional in the order schema, so
 * blanks are skipped rather than printed as gaps or stray punctuation.
 */
export function ShippingAddress({ address }: { address: Address | null }) {
  const t = useTranslations("ShippingAddress");
  if (!address) return <p className="text-sm text-text-tertiary">{t("noAddress")}</p>;

  const cityLine = [address.city, address.region].filter(Boolean).join(", ");
  const lines = [
    address.recipient,
    address.line1,
    address.line2,
    cityLine || null,
    address.postalCode,
    address.country,
  ].filter((l): l is string => Boolean(l && l.trim()));

  if (lines.length === 0) return <p className="text-sm text-text-tertiary">{t("noAddress")}</p>;

  return (
    <address className="text-sm not-italic leading-relaxed text-text-secondary">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
      {address.phone && <span className="mt-1 block text-xs text-text-tertiary">{address.phone}</span>}
    </address>
  );
}
