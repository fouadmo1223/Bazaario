"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { formatMoney } from "@/shared/lib/format";

type QuickResult = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  status: "draft" | "active" | "archived";
};

/**
 * Dashboard product search — same debounced-dropdown pattern as the storefront
 * header, but vendor-scoped (`/api/dashboard/products/search`) and linking
 * straight to the edit page rather than a storefront product page.
 */
export function ProductSearchBox({
  defaultValue,
  status,
}: {
  defaultValue: string;
  /** Carried through to the full search submit so a status chip stays applied. */
  status?: string;
}) {
  const t = useTranslations("DashboardProducts");
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(value.trim(), 300);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stale results linger in state when the query empties out, but the
    // dropdown itself only renders while `value.trim()` is non-empty, so
    // there is nothing to clear the render can't already hide.
    if (!debounced) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flips a loading flag for the fetch this same effect starts, not derivable from props/state.
    setLoading(true);
    fetch(`/api/dashboard/products/search?q=${encodeURIComponent(debounced)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { ok: boolean; data?: { items: QuickResult[] } }) => {
        if (cancelled) return;
        setResults(body.ok && body.data ? body.data.items : []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOpen(false);
    const query = new URLSearchParams();
    if (value.trim()) query.set("search", value.trim());
    if (status) query.set("status", status);
    router.push(`/dashboard/products${query.toString() ? `?${query}` : ""}`);
  }

  return (
    <div ref={rootRef} className="relative">
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="product-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="product-search"
          name="search"
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          placeholder={t("searchPlaceholder")}
          className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-border-default px-3 py-1.5 text-sm text-text-secondary transition hover:bg-surface-raised"
        >
          {t("search")}
        </button>
      </form>

      {open && value.trim() && (
        <div className="absolute z-40 mt-1 w-80 overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-lg">
          {loading ? (
            <p className="px-3 py-4 text-sm text-text-tertiary">{t("loading")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-text-tertiary">{t("noProducts")}</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/products/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 transition hover:bg-surface-raised"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-raised">
                      {r.image ? (
                        <Image src={r.image} alt="" fill sizes="40px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{r.title}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-text-tertiary">
                      {formatMoney(r.price, "USD")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
