"use client";

import { useMemo, useState } from "react";
import { AddToCartButton } from "@/features/cart/components/add-to-cart-button";
import { WishlistButton } from "@/features/wishlist/components/wishlist-button";
import { formatMoney } from "@/shared/lib/format";

export type VariantOption = { name: string; values: string[] };

export type VariantView = {
  id: string;
  options: Record<string, string>;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  image: string | null;
};

/**
 * Option selector for a variable product.
 *
 * Nothing is added to the cart until a complete combination resolves to a real
 * variant, because the cart is keyed on `variantId` — an "add" without one is
 * exactly what the service rejects with "Please select a variant".
 *
 * Values that can't lead to a purchasable variant *given the current selection*
 * are disabled rather than hidden: hiding them makes the control jump around as
 * you choose, and leaves no clue the combination existed at all.
 */
export function VariantPicker({
  vendorId,
  vendorSlug,
  productId,
  attributes,
  variants,
  currency,
  onImageChange,
}: {
  vendorId: string;
  vendorSlug: string;
  productId: string;
  attributes: VariantOption[];
  variants: VariantView[];
  currency: string;
  /** Lets the gallery follow the chosen variant's image. */
  onImageChange?: (url: string | null) => void;
}) {
  // Preselect the first in-stock variant so the page opens on something buyable.
  const initial = useMemo(() => {
    const preferred = variants.find((v) => v.stock > 0) ?? variants[0];
    return preferred ? { ...preferred.options } : {};
  }, [variants]);

  const [selection, setSelection] = useState<Record<string, string>>(initial);

  const selected = useMemo(
    () =>
      variants.find((v) =>
        attributes.every((a) => v.options[a.name] === selection[a.name]),
      ) ?? null,
    [variants, attributes, selection],
  );

  /**
   * Is `value` for `attr` reachable, holding the *other* choices fixed? A value
   * with no in-stock variant behind it is offered but marked unavailable.
   */
  function availability(attrName: string, value: string): "ok" | "oos" | "none" {
    const candidates = variants.filter((v) => {
      if (v.options[attrName] !== value) return false;
      return attributes
        .filter((a) => a.name !== attrName)
        .every((a) => !selection[a.name] || v.options[a.name] === selection[a.name]);
    });
    if (candidates.length === 0) return "none";
    return candidates.some((v) => v.stock > 0) ? "ok" : "oos";
  }

  function choose(attrName: string, value: string) {
    const next = { ...selection, [attrName]: value };

    // The new value may not co-exist with the other choices. Fall back to a real
    // variant that honours this choice rather than leaving a dead combination.
    const exact = variants.find((v) => attributes.every((a) => v.options[a.name] === next[a.name]));
    if (!exact) {
      const fallback =
        variants.find((v) => v.options[attrName] === value && v.stock > 0) ??
        variants.find((v) => v.options[attrName] === value);
      if (fallback) {
        setSelection({ ...fallback.options });
        onImageChange?.(fallback.image);
        return;
      }
    }

    setSelection(next);
    if (exact) onImageChange?.(exact.image);
  }

  const price = selected?.price;
  const compareAt = selected?.compareAtPrice ?? null;
  const onSale = price != null && compareAt != null && compareAt > price;
  const inStock = (selected?.stock ?? 0) > 0;

  return (
    <div>
      <div className="mt-4 flex items-baseline gap-3">
        {price != null ? (
          <>
            <span className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {formatMoney(price, currency)}
            </span>
            {onSale && (
              <span className="text-lg text-zinc-400 line-through">
                {formatMoney(compareAt!, currency)}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-zinc-500">Select options to see the price</span>
        )}
      </div>

      <p className="mt-2 text-sm">
        {!selected ? (
          <span className="text-zinc-500">Choose an option</span>
        ) : inStock ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            In stock{selected.stock <= 5 ? ` — only ${selected.stock} left` : ""}
          </span>
        ) : (
          <span className="text-red-600 dark:text-red-400">Out of stock</span>
        )}
      </p>

      <div className="mt-6 space-y-5">
        {attributes.map((attr) => (
          <fieldset key={attr.name}>
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {attr.name}
              {selection[attr.name] && (
                <span className="ml-1 text-zinc-400">— {selection[attr.name]}</span>
              )}
            </legend>

            <div className="mt-2 flex flex-wrap gap-2">
              {attr.values.map((value) => {
                const state = availability(attr.name, value);
                const active = selection[attr.name] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => choose(attr.name, value)}
                    disabled={state === "none"}
                    aria-pressed={active}
                    title={
                      state === "none"
                        ? "Not available with your other choices"
                        : state === "oos"
                          ? "Out of stock"
                          : undefined
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      active
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : state === "none"
                          ? "cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700"
                          : state === "oos"
                            ? "border-zinc-200 text-zinc-400 line-through dark:border-zinc-800"
                            : "border-zinc-300 text-zinc-700 hover:border-indigo-400 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {selected?.sku && <p className="mt-4 text-xs text-zinc-500">SKU: {selected.sku}</p>}

      <div className="mt-8 flex items-center gap-3">
        <AddToCartButton
          className="flex-1"
          vendorId={vendorId}
          vendorSlug={vendorSlug}
          productId={productId}
          variantId={selected?.id}
          // No resolved variant means nothing to add — the service would refuse.
          disabled={!selected || !inStock}
          soldOutLabel={selected ? "Sold out" : "Select options"}
        />
        <WishlistButton productId={productId} />
      </div>
    </div>
  );
}
