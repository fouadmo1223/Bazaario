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
  if (!address) return <p className="text-sm text-zinc-500">No address on file.</p>;

  const cityLine = [address.city, address.region].filter(Boolean).join(", ");
  const lines = [
    address.recipient,
    address.line1,
    address.line2,
    cityLine || null,
    address.postalCode,
    address.country,
  ].filter((l): l is string => Boolean(l && l.trim()));

  if (lines.length === 0) return <p className="text-sm text-zinc-500">No address on file.</p>;

  return (
    <address className="text-sm not-italic leading-relaxed text-zinc-600 dark:text-zinc-400">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
      {address.phone && <span className="mt-1 block text-xs text-zinc-500">{address.phone}</span>}
    </address>
  );
}
