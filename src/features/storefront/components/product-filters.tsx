"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/shared/components/select";

export type FilterFacets = {
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
  priceBounds: { min: number; max: number };
};

/**
 * Storefront filters.
 *
 * State lives in the URL, not component state: a filtered listing should be
 * shareable, linkable, and survive a reload or a back button. Each change pushes
 * a new query and lets the server re-render — the server is the only thing that
 * decides what a filter actually means.
 */
export function ProductFilters({
  facets,
  hideCategory = false,
}: {
  facets: FilterFacets;
  /** On a category page the category is fixed by the route. */
  hideCategory?: boolean;
}) {
  const t = useTranslations("Filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [minPrice, setMinPrice] = useState(params.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") ?? "");

  const SORTS = [
    { value: "newest", label: t("sortNewest") },
    { value: "price_asc", label: t("sortPriceAsc") },
    { value: "price_desc", label: t("sortPriceDesc") },
    { value: "rating", label: t("sortRating") },
    { value: "popular", label: t("sortPopular") },
  ];

  /** Rewrite one param, always resetting to page 1 — page 3 of a new filter is nonsense. */
  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const activeCount = ["category", "brand", "minPrice", "maxPrice", "minRating", "inStock"].filter(
    (k) => params.get(k),
  ).length;

  return (
    <aside aria-label={t("title")} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("title")}</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              // Keep the search term; clear only the facets.
              const search = params.get("search");
              router.push(search ? `${pathname}?search=${encodeURIComponent(search)}` : pathname);
            }}
            className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {t("clear", { count: activeCount })}
          </button>
        )}
      </div>

      <Group label={t("sort")}>
        <Select
          value={params.get("sort") ?? "newest"}
          onChange={(v) => apply({ sort: v })}
          aria-label={t("sort")}
          options={SORTS}
        />
      </Group>

      {!hideCategory && facets.categories.length > 0 && (
        <Group label={t("category")}>
          <Select
            value={params.get("category") ?? ""}
            onChange={(v) => apply({ category: v || null })}
            aria-label={t("category")}
            options={[
              { value: "", label: t("allCategories") },
              ...facets.categories.map((c) => ({ value: c.slug, label: c.name })),
            ]}
          />
        </Group>
      )}

      {facets.brands.length > 0 && (
        <Group label={t("brand")}>
          <Select
            value={params.get("brand") ?? ""}
            onChange={(v) => apply({ brand: v || null })}
            aria-label={t("brand")}
            options={[
              { value: "", label: t("allBrands") },
              ...facets.brands.map((b) => ({ value: b.slug, label: b.name })),
            ]}
          />
        </Group>
      )}

      <Group label={t("price")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ minPrice: minPrice || null, maxPrice: maxPrice || null });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder={String(facets.priceBounds.min)}
            aria-label={t("minPrice")}
            className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-800 dark:bg-zinc-950"
          />
          <span aria-hidden className="text-zinc-400">–</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder={String(facets.priceBounds.max)}
            aria-label={t("maxPrice")}
            className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-800 dark:bg-zinc-950"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium dark:border-zinc-700"
          >
            {t("go")}
          </button>
        </form>
      </Group>

      <Group label={t("rating")}>
        <div className="space-y-1">
          {[4, 3, 2].map((r) => {
            const active = params.get("minRating") === String(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => apply({ minRating: active ? null : String(r) })}
                aria-pressed={active}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {t("ratingUp", { stars: r })}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label={t("availability")}>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={params.get("inStock") === "true"}
            onChange={(e) => apply({ inStock: e.target.checked ? "true" : null })}
            className="h-4 w-4 accent-indigo-600"
          />
          {t("inStockOnly")}
        </label>
      </Group>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</h3>
      {children}
    </div>
  );
}
