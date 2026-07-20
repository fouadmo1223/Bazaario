"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useStorefront } from "../storefront-provider";

/**
 * Marketplace header: search, wishlist, cart, account.
 *
 * Badge counts come from `StorefrontProvider`, which fetches them client-side so
 * the ISR-cached pages underneath stay shared between visitors.
 */
export function StorefrontHeader() {
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
          Commerce
        </Link>

        <nav aria-label="Browse" className="hidden shrink-0 items-center gap-1 sm:flex">
          <HeaderLink href="/products">Products</HeaderLink>
          <HeaderLink href="/categories">Categories</HeaderLink>
        </nav>

        <SearchBox />

        <div className="flex shrink-0 items-center gap-1">
          <IconLink href="/wishlist" label="Wishlist" count={counts.wishlist}>
            {/* Heart */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconLink>

          <IconLink href="/cart" label="Cart" count={counts.cart}>
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
            Account
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

/**
 * Search that seeds itself from the URL so a reload keeps the visible term.
 *
 * Uncontrolled, with `key` tied to the URL's term: when navigation changes
 * `?search=`, React remounts the input and it picks up the new `defaultValue`.
 * Mirroring the URL into state via an effect would render the stale value first
 * and then overwrite it — a wasted pass, and the reason the lint rule exists.
 */
function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const urlSearch = params.get("search") ?? "";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("search") ?? "").trim();
    router.push(q ? `/products?search=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <form onSubmit={submit} role="search" className="min-w-0 flex-1">
      <label htmlFor="storefront-search" className="sr-only">
        Search products
      </label>
      <input
        key={urlSearch}
        id="storefront-search"
        name="search"
        type="search"
        defaultValue={urlSearch}
        placeholder="Search products…"
        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:bg-zinc-950"
      />
    </form>
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
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold tabular-nums text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
