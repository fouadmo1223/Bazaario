"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

export type FilterFacets = {
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
  priceBounds: { min: number; max: number };
};

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "popular", label: "Best selling" },
];

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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [minPrice, setMinPrice] = useState(params.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") ?? "");

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
    <aside aria-label="Filters" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Filters</h2>
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
            Clear ({activeCount})
          </button>
        )}
      </div>

      <Group label="Sort">
        <select
          value={params.get("sort") ?? "newest"}
          onChange={(e) => apply({ sort: e.target.value })}
          aria-label="Sort products"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Group>

      {!hideCategory && facets.categories.length > 0 && (
        <Group label="Category">
          <select
            value={params.get("category") ?? ""}
            onChange={(e) => apply({ category: e.target.value || null })}
            aria-label="Filter by category"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="">All categories</option>
            {facets.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Group>
      )}

      {facets.brands.length > 0 && (
        <Group label="Brand">
          <select
            value={params.get("brand") ?? ""}
            onChange={(e) => apply({ brand: e.target.value || null })}
            aria-label="Filter by brand"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="">All brands</option>
            {facets.brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </Group>
      )}

      <Group label="Price">
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
            aria-label="Minimum price"
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
            aria-label="Maximum price"
            className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-800 dark:bg-zinc-950"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium dark:border-zinc-700"
          >
            Go
          </button>
        </form>
      </Group>

      <Group label="Rating">
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
                ★ {r} & up
              </button>
            );
          })}
        </div>
      </Group>

      <Group label="Availability">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={params.get("inStock") === "true"}
            onChange={(e) => apply({ inStock: e.target.checked ? "true" : null })}
            className="h-4 w-4 accent-indigo-600"
          />
          In stock only
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
