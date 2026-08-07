"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useStorefront } from "../storefront-provider";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { LanguageSwitcher } from "./language-switcher";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { formatMoney } from "@/shared/lib/format";

/**
 * Marketplace header: search, wishlist, cart, account.
 *
 * Badge counts come from `StorefrontProvider`, which fetches them client-side so
 * the ISR-cached pages underneath stay shared between visitors.
 */
export function StorefrontHeader() {
  const t = useTranslations("StorefrontHeader");
  const storefront = useStorefront();
  const counts = {
    cart: storefront?.cartCount ?? 0,
    wishlist: storefront?.wishlistCount ?? 0,
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="shrink-0 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Bazaario
        </Link>

        <nav aria-label="Browse" className="hidden shrink-0 items-center gap-1 sm:flex">
          <HeaderLink href="/products">{t("products")}</HeaderLink>
          <HeaderLink href="/categories">{t("categories")}</HeaderLink>
        </nav>

        <SearchBox />

        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher />

          {/* Only for an account — a guest has nothing to be notified about. */}
          {storefront?.signedIn ? <NotificationBell /> : null}

          <IconLink href="/wishlist" label={t("wishlist")} count={counts.wishlist}>
            {/* Heart */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconLink>

          <IconLink href="/cart" label={t("cart")} count={counts.cart}>
            {/* Bag */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconLink>

          {/* Lands on the profile, which links out to orders, messages and
              wishlist — "Account" meaning only "orders" was a dead end. */}
          <Link
            href="/account/profile"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            {t("account")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}

type QuickResult = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  priceRange: { min: number; max: number } | null;
  vendorSlug: string;
};

/**
 * Search that seeds itself from the URL so a reload keeps the visible term,
 * plus a debounced dropdown of matching products as you type.
 *
 * The input is controlled (not the URL-seeded uncontrolled pattern this had
 * before) because the dropdown needs to react to keystrokes; it still starts
 * from `?search=` on mount so a reload keeps the visible term.
 */
function SearchBox() {
  const t = useTranslations("StorefrontHeader");
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("search") ?? "");
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
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { cache: "no-store" })
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
    const q = value.trim();
    router.push(q ? `/products?search=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <form onSubmit={submit} role="search">
        <label htmlFor="storefront-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="storefront-search"
          name="search"
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:bg-zinc-950"
        />
      </form>

      {open && value.trim() && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          {loading ? (
            <p className="px-3 py-4 text-sm text-zinc-500">{t("searching")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-zinc-500">{t("noQuickResults")}</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/v/${r.vendorSlug}/p/${r.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      {r.image ? (
                        <Image src={r.image} alt="" fill sizes="40px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{r.title}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                      {r.priceRange ? `${formatMoney(r.priceRange.min, "USD")}+` : formatMoney(r.price, "USD")}
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

function IconLink({
  href,
  label,
  count,
  children,
}: {
  href: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? `${label} (${count})` : label}
      className="relative rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
    >
      {children}
      {count > 0 && (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold tabular-nums text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
