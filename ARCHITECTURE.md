# Multi-Vendor Marketplace — Architecture & Design

> Status: living document. This is the design that every implementation increment is built against.
> Stack baseline verified against installed versions: **Next.js 16.2.10 (App Router)**, **React 19.2**, TypeScript strict.
> Platform note: In Next.js 16, **Middleware was renamed to `proxy.ts`** — the platform uses it only for _optimistic_ edge checks, never as the authorization source of truth.
> Vocabulary: a store is a **Vendor** (`Vendor` model, `vendor` role, `/v/{slug}` routes). The `marketing` role is unrelated — do not fold it into this rename.

---

## 1. System Architecture

### 1.1 Shape
A single Next.js App-Router application (deployed on Vercel) that serves three surfaces from one codebase, separated by route groups:

| Surface | Route group | Audience |
|---|---|---|
| Storefront | `(storefront)` | Guests, Customers |
| Vendor dashboard | `(dashboard)` | Vendor Admin, Marketing, Support, Delivery Driver |
| Platform console | `(platform)` | Super Admin |

### 1.2 Layers (dependency direction points downward only)
```
Presentation      → React Server/Client Components, GSAP/Lenis, shadcn/ui
Application        → Server Actions + Route Handlers (thin controllers)
Domain / Services  → business logic, invariants, orchestration  (services/)
Data Access        → Repository pattern over Mongoose            (repositories/)
Infrastructure     → Mongo, Redis, Cloudinary, Stripe/Paymob, Mail, Socket.IO
```
**Rule:** Presentation never touches Mongoose. Controllers never embed business logic. Services never import Next.js request objects. This keeps the domain testable and framework-agnostic.

### 1.3 Realtime
A standalone Socket.IO server (`server/realtime`) run as a Vercel-external Node service (or long-running container), since Vercel serverless can't hold sockets. Auth via a short-lived token from `/api/realtime/token`, verified with `JWT_ACCESS_SECRET`. Rooms: `vendor:{id}`, `order:{id}`, `user:{id}`, `conversation:{id}` — **every join is authorized against the database**, not taken on the client's word. Redis pub/sub bridges server actions to the socket process; the Redis *adapter* for multi-instance scale is not installed yet (§8.3). See §7.1.

### 1.4 Caching strategy
- **Redis**: sessions/refresh-token allowlist, rate-limit counters, cart TTL for guests, hot product reads, search facets, idempotency keys.
- **Next cache**: ISR for storefront product/category pages, tag-based revalidation (`revalidateTag('vendor:{id}:products')`) on mutation.
- **CDN**: Cloudinary for media (Sharp only for pre-upload normalization).

---

## 2. Data Model (MongoDB / Mongoose)

### 2.1 Cross-cutting conventions (applied to every schema via a base plugin)
- `timestamps: true` (createdAt / updatedAt)
- Soft delete: `deletedAt: Date | null`, `isDeleted` virtual, default query filter excludes deleted.
- Audit: `createdBy`, `updatedBy` (ObjectId → User).
- `toJSON`/`toObject`: virtuals on, `__v` stripped, `_id`→`id`.
- Multi-vendor isolation: every vendor-owned document carries `vendor: ObjectId` **indexed**, and all repository queries are vendor-scoped by a mandatory `vendorId` argument.
- Pagination: shared `paginate()` helper (cursor + offset variants).

### 2.2 Core collections
```
User            _id, email(uniq), passwordHash, name, avatar, roles[], status,
                emailVerifiedAt, providers[{provider,sub}], defaultVendor?
Vendor          _id, name, slug(uniq), owner→User(one Vendor Admin), status,
                currency, locales[], settings{...}, theme, domains[]
Membership      user, vendor, role(enum), permissions[] (RBAC grant per vendor)
Category        vendor, name, slug, parent?, path[], seo
Brand           vendor, name, slug, logo
Product         vendor, type(simple|variable), title, slug, description, brand?,
                categories[], tags[], attributes[], seo, media[], status,
                price/compareAt (simple), ratingAvg, ratingCount
Variant         product, vendor, sku(uniq per vendor), barcode, options{},
                price, compareAt, stock, weight, dimensions, media[]
Inventory       vendor, variant, onHand, reserved, backorder policy, lowStockAt
Cart            vendor, user?|guestToken, items[{variant,qty,priceSnapshot}], coupon?
Wishlist        user?|guestToken, items[{product,vendor,addedAt}]
                (NOT vendor-scoped — a shopper's saved items span the marketplace;
                 no price snapshot — prices read live when the list is viewed)
Order           vendor, number, customer, items[snapshot], totals{sub,tax,ship,disc,grand},
                status, timeline[], payment{provider,status,ref}, shipping{addr,method,slot},
                fulfillment, refunds[], returns[{reason,status,requestedAt,resolvedAt,resolvedBy}]
Address         user, label, recipient, phone, lines, city, region, country, geo
Coupon          vendor, code, type, value, constraints{minSpend,usageLimit,perUser,window}
Review          vendor, product, customer, rating, title, body, status, media[]
Ticket          vendor, customer, subject, status, priority, messages[]
Notification    user, vendor?, type, channel, payload, readAt
Wallet          user(unique), balance (minor units) — the fast-read authoritative balance
WalletTxn       user, type(credit|debit), amount, balanceAfter, reason, reference?, issuedBy?
LoyaltyLedger   user, vendor, points, reason, ref
Banner          vendor, message, linkUrl?, linkLabel?, startsAt?, endsAt?, isActive
CmsPage/Blog/Menu   vendor-scoped content (aspirational, not yet built)
AuditLog        actor, vendor?, action, entity, entityId, diff, ip, ua, at
```

### 2.3 Key relationships & indexes
- `Product.vendor + slug` unique compound; `Variant.vendor + sku` unique.
- `Order.vendor + number` unique; `Order.vendor + status + createdAt` for dashboards.
- `Membership.user + vendor` unique (enforces one role record per user per vendor; **Vendor has exactly one owner** enforced at `Vendor.owner` + a service invariant).
- Text index on `Product.title/description/tags` for full-text search (Atlas Search upgrade path noted).

---

## 3. Folder Structure (feature-based)
```
src/
  app/                      # routing only — thin
    (storefront)/  (dashboard)/  (platform)/  (auth)/
    api/                    # route handlers (webhooks, uploads, health)
  features/                 # vertical slices: ui + hooks + actions per domain
    auth/ products/ cart/ checkout/ orders/ vendors/ reviews/ cms/ ...
  server/
    services/               # business logic
    repositories/           # data access over mongoose
    database/               # connection, models, plugins
    realtime/               # socket.io server + handlers
    cache/                  # redis client + helpers
    mail/                   # nodemailer + react-email render
    payments/               # stripe, paymob, cod adapters (strategy pattern)
    storage/                # cloudinary + sharp
    security/               # jwt, password, rbac, rate-limit, sanitize
  shared/
    components/ ui/         # shadcn + generic Table/Form/DataView
    hooks/ providers/ lib/ utils/ types/ constants/ config/ schemas/
  emails/                   # react-email templates
  i18n/                     # next-intl messages ar/en
  actions/                  # cross-feature server actions
  middleware → proxy.ts     # optimistic edge checks (root level)
```

---

## 4. API / Action Surface (representative, not exhaustive)
Convention: **mutations = Server Actions** (co-located in feature `actions.ts`, each independently auth-guarded). **Webhooks, uploads, health, and third-party callbacks = Route Handlers** under `app/api`.

```
Auth      POST /api/auth/{register,login,refresh,logout,verify,otp}
          action: forgotPassword, resetPassword, oauthCallback
Products  action: create/update/delete/publish (vendor-scoped)   read: RSC + repo
Cart      action: add/update/remove/clear/applyCoupon/removeCoupon
          GET  /api/cart/count?vendorId=  (badge; keeps storefront ISR-cacheable)
Checkout  action: placeOrder → createOrder → payment initiate
Payments  POST /api/webhooks/{stripe,paymob}   (signature-verified, idempotent)
Uploads   POST /api/uploads (signed Cloudinary)  Sharp pre-process
Orders    action: updateStatus, refund, cancel, addNote, requestReturn, resolveReturn, reorder,
          assignDriver, driverUpdateStatus
Banners   action: create/update/delete (vendor-scoped, CMS_WRITE)   read: RSC + repo
Wallet    action: creditWallet (vendor/admin, ORDER_REFUND), initiateTopUp (self-serve,
          Stripe Checkout)   debit happens inline in checkout.service.createOrder, not
          as an action   read: getWalletView (RSC)
Search    GET  /api/search?q=  (debounced client, Redis-cached facets)
Realtime  socket events: notification, order:update, chat:message, presence,
          driver:location (in) / order:location (out) — live delivery tracking
Health    GET  /api/health  (db+redis probes)
```

### 4.1 Routes
```
Marketplace  — route group (storefront), shared header/footer, no URL segment
/                           home: featured, best sellers, categories, stores (ISR 60)
/products                   full catalogue + filters (URL-driven)
/categories                 category index (ISR 300)
/categories/{slug}          category browse, marketplace-wide
/wishlist                   saved items    (dynamic — per-visitor)
/cart                       open carts per store (dynamic — per-visitor)

Storefront
/v/{vendor}                 vendor storefront (ISR, revalidate 60)
/v/{vendor}/p/{slug}        product detail (ISR + JSON-LD)
/v/{vendor}/cart            cart            (dynamic — per-visitor)
/v/{vendor}/checkout        checkout        (dynamic — per-visitor)
/v/{vendor}/order/{id}      confirmation    (dynamic — access-gated, see §5.1)

Account (signed-in customer; own orders only)
/account/orders             order history
/account/orders/{id}        order detail + cancel (pending only)

Dashboard (vendor staff; requires order:read:vendor)
/dashboard                  analytics overview
/dashboard/orders           order list + status filter
/dashboard/orders/{id}      detail; transitions gated on order:fulfill,
                            refunds gated on order:refund
```

Unauthenticated hits on `/account/*` and `/dashboard/*` redirect to
`/login?next=<path>`. That value is attacker-controlled, so it is passed through
`safeRedirectPath()` before any navigation — see `shared/lib/safe-redirect.ts`.

**Auth must resolve before anything streams.** Next commits the response with a
200 the moment it flushes the shell at a `<Suspense>` boundary; a `redirect()`
thrown after that has no status line left to set, and the visitor sits on the
fallback forever. `/dashboard` did exactly this — it answered 200 and rendered
"Loading dashboard…" indefinitely for signed-out visitors. Resolve the session in
the page body and wrap only the slow work (there, the analytics aggregations).

### 4.2 Money & trust boundary
Nothing that determines a price is accepted from the client. Checkout receives a
shipping **method id** and a payment **provider id** only; the server resolves the
fee (`shipping.service`), re-reads every line price from the Product/Variant
documents, and recomputes totals. Cart price snapshots exist for display
stability and are never used to charge.

Tax rate lives in `pricing.service.vendorTaxRate()` — one source, so the cart
preview and the charged total cannot drift apart.

### 4.3 Public catalogue (the one cross-vendor read path)
`catalog.service` serves the marketplace-wide catalogue and is the **deliberate
exception** to the vendor-scoping rule in §5. That rule governs *staff* access —
a vendor admin must never read another vendor's data. This path is different: it
is public, read-only, and spans vendors by definition. Two invariants hold on
every query:

1. products must be `status: "active"`
2. their vendor must be `status: "active"` — suspending a vendor removes its
   products from the marketplace rather than letting it keep selling

Callers never supply a vendor scope or a status; both are pinned *after* the
caller's filters are spread in. `category` and `brand` arrive as slugs (URLs
must be shareable) and resolve to id sets — each vendor has its own Category and
Brand rows, so one slug means every vendor's. An unknown slug matches nothing
rather than being dropped, which would silently show the whole catalogue.

### 4.4 Per-visitor state vs the shared cache
The storefront is ISR-cached and shared between visitors, so **cart badges,
wishlist hearts, and counts are never rendered on the server**. Reading those
cookies during a page's render would force it dynamic and rebuild the whole
catalogue per visitor just to colour a heart. `StorefrontProvider` fetches them
once from `/api/storefront/counts` and shares the snapshot with the header and
every product card. `/` staying `○ Static` in the build output is the check that
this still holds.

Genuinely personal pages (`/wishlist`, `/cart`, `/account/*`, checkout) are
`force-dynamic` and read cookies directly — correct, because nothing about them
is shareable.

### 4.5 Order status machine
`order.service` owns the legal transitions. `canTransition(from, to)` is the
guard; `allowedTransitions(from)` is what the dashboard renders — the UI offers
exactly the set the service will accept, and the service re-checks on submit, so
a stale page cannot force an illegal jump (e.g. `delivered → pending`).
`cancelled` and `refunded` are terminal. COD captures payment on `delivered`.

---

## 5. RBAC / Permissions Matrix
Roles: `guest, customer, vendor, marketing, support, delivery_driver, super_admin`.
Model = **role → permission set**, evaluated **within a vendor scope** (except super_admin which is global). Permissions are `resource:action` strings; guards run in services (source of truth) and optimistically in `proxy.ts`.

| Capability (resource:action) | guest | customer | delivery | support | marketing | vendor | super_admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| catalog:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cart:write / order:create | ➖ | ✅ | – | – | – | – | ✅ |
| order:read (own) | – | ✅ | – | – | – | – | ✅ |
| order:read (vendor) | – | – | assigned | ✅ | ✅ | ✅ | ✅ |
| order:fulfill / delivery:update | – | – | ✅ | – | – | ✅ | ✅ |
| order:refund | – | – | – | – | – | ✅ | ✅ |
| product:write / inventory:write | – | – | – | – | – | ✅ | ✅ |
| coupon:write / campaign:write | – | – | – | – | ✅ | ✅ | ✅ |
| ticket:respond | – | own | – | ✅ | – | ✅ | ✅ |
| cms:write / analytics:read | – | – | – | – | ✅ | ✅ | ✅ |
| vendor:create/suspend/assign_admin | – | – | – | – | – | – | ✅ |
| platform:settings / users:manage / audit:read | – | – | – | – | – | – | ✅ |

Isolation guarantee: a `vendor` token is bound to their `vendor` via `Membership`; every service call re-checks `membership.vendor === resource.vendor`. No cross-vendor read path exists.

### 5.1 Anonymous identity & order access
Guests have no session to authorize against, so two capability cookies carry them:

| Cookie | Purpose | Notes |
|---|---|---|
| `guest_token` | names the visitor's Carts **and** Wishlist | opaque random, httpOnly; both merged into the account on login (`absorbGuestData`) and only then cleared |
| `order_access` | ids of orders this visitor placed | httpOnly, capped at 10 |

**Why `order_access` exists:** order numbers are sequential (`1000 + seq`), so a
confirmation page keyed on the number would let anyone walk `/order/1002` into
the next shopper's order. Confirmation is keyed on ObjectId *and* gated: a
signed-in shopper must own the order, a guest must hold a grant. Failures render
404, not 403 — existence itself isn't disclosed.

Cookie writes are only legal in Server Actions / Route Handlers, so the guest
token has a read-only path (`readGuestToken`, safe in RSC) separate from its
create path (`getOrCreateGuestToken`, actions only).

> **Maps decision:** Standardized on **Leaflet + OpenStreetMap** (free, no API key) for delivery zones and live tracking. Mapbox dropped to avoid a token dependency.

---

## 6. Build Order (implementation roadmap)
1. ✅ **Foundation** — env validation, DB/Redis clients, base schema plugin, logger, typed errors, API-response + result helpers, RBAC constants.
2. ✅ **Auth & RBAC** — User/Membership models, password/JWT/refresh, register/login/verify/OTP, Google OAuth, `proxy.ts`, guards.
3. ✅ **Vendors & tenancy** — Vendor model, provisioning, admin assignment, scoping.
4. ✅ **Catalog** — Category/Brand/Product/Variant/Inventory + repositories + storefront reads.
5. ✅ **Cart & Checkout** — cart service + actions + UI, guest/user/merge, coupons, taxes, server-resolved shipping, order creation, confirmation.
6. ✅ **Payments** — Stripe + Paymob + COD strategy adapters + webhooks + idempotency. *(Provider credentials still unset in `.env.local`; only COD is selectable until they are.)*
7. ✅ **Orders & Delivery** — lifecycle + refunds wired end-to-end: customer history (`/account/orders`) with reorder/invoice/returns, vendor dashboard (`/dashboard/orders`) with status-machine-driven transitions, refunds, and driver assignment, driver-facing `/dashboard/deliveries` with live location sharing and a customer-facing Leaflet tracking map while an order is `out_for_delivery` (see §6.5).
8. ✅ **Realtime & Notifications** — Socket.IO server with database-checked room authorization; chat (Conversation/Message) wired end-to-end across shopper, vendor, and admin inboxes; notification bell UI; email fallback for a recipient with no active socket, gated per-notification by `channels` (only chat replies opt in today).
9. ✅ **Storefront UI** — marketplace home, `/products` with URL-driven filters (category, brand, price, rating, stock, sort), category browse, wishlist (model + service + actions + UI, guest-capable and merged on login), per-store cart overview, quick-view modal, reviews, chat/support, and a per-vendor announcement banner (`/dashboard/banners` → `Banner` model, shown at the top of `/v/[vendor]`). *(Full CMS pages/blog/menu — the aspirational `CmsPage/Blog/Menu` sketch below — still unbuilt; the banner is the one slice of it a marketplace storefront needs on day one.)*
10. ✅ **Dashboards & Analytics** — vendor dashboard + Recharts exist; product management UI (`/dashboard/products`: list, create, edit, delete) landed; SEO done for storefront; PWA landed (installable — `app/manifest.ts`, generated icons via `next/og`, a minimal `public/sw.js` that only makes navigation resilient to a dropped connection, no offline app functionality since cart/order data is too live/personal to cache safely). i18n/RTL landed for the storefront shell on a proper `[locale]` URL segment (see §6.6) — a scoped slice (header, footer, home page), not every page in the app, but the routing/ISR foundation is correct for extending it.
11. ⏳ **Hardening** — rate limiting + audit logs + sanitize in place; vitest suite (§9) and GitHub Actions CI running typecheck, lint, tests, and build. *(Coverage is still narrow — see §9.1.)*

### 6.1 Known gaps
- **Test coverage is narrow.** A suite exists (§9) and covers the two invariants most likely to be broken silently — conversation access control and the oversell guard — but auth, payments, refunds, cart merging, and the order status machine are still unprotected.
- Customers can now reorder ("Buy again" on `/account/orders/[id]` re-adds a past order's lines to the cart, best-effort per line via `orderService.reorder` — a discontinued or sold-out item is reported, not blocking the rest), download an invoice (`/account/orders/[id]/invoice`, a print-styled page — "Save as PDF" in the browser print dialog covers the PDF case without a rendering dependency), and request a return (reviewed by the vendor at `/dashboard/orders/[id]`, approving doesn't itself refund — see §6 step 7). Drivers now have a UI: `/dashboard/deliveries` lists a driver's own assigned orders (`orderService.listForDriver`, which existed unused before this), `/dashboard/deliveries/[id]` shows the delivery address and a two-step status control (shipped → out for delivery → delivered) scoped to `driverUpdateStatusAction`'s existing ownership check; `/dashboard/orders/[id]` gained a driver-assignment dropdown that was previously wired to nothing (`assignDriverAction` existed with no UI calling it).
- Stack items from the brief not yet installed: shadcn/ui, TanStack Query, React Hook Form, Zustand, Lenis, Cloudinary/Sharp, next-intl, next-themes. Current UI is hand-rolled Tailwind v4 (GSAP is installed and drives the storefront reveal animations; Leaflet + react-leaflet landed for live delivery tracking, §6.5). With no component library installed, dropdowns are a hand-rolled `Select` (`src/shared/components/select.tsx`) — a real `<button>` trigger plus a `role="listbox"`/`role="option"` popup, replacing every native `<select>` in the app (native option lists can't be styled consistently across browsers/OSes). It supports both controlled (`value`/`onChange`) and plain-form (`name`, submitted via a hidden input so it still works inside a `<form action={...}>` built on `useActionState`, e.g. `CreateVendorUserForm`) usage, and implements the standard listbox keyboard pattern (Arrow keys, Home/End, Enter/Space, Escape, Tab-to-close) rather than only being mouse-operable.
- The vendor product editor (`/dashboard/products`) covers create, edit, and delete for simple and variable products, plus a **variant matrix editor**: a "Variants" action on a variable product opens a grid of every option combination (the cartesian product of the option values) where each cell can be switched on and given its own SKU, price, compare-at, stock, and active flag. Options and variants save together through `syncVariantsAction`, which also recomputes the denormalized `priceRange`/`from` price from the **active** variants only. A combination left off is simply not stocked — the storefront picker already disables the gaps — so a sparse matrix (a shoe in five sizes and three colours but only ten real SKUs) is expressed by leaving cells off rather than filling them all.
- `catalog.service` resolves active vendors to an id list and matches with `$in`. Fine at this size; becomes a problem at thousands of vendors, where it should be an aggregation `$lookup`.
- **Wallet payment provider — built.** Platform-wide store credit (one balance per customer, spendable at any vendor), funded by vendor/admin-issued credit (`PERMISSIONS.ORDER_REFUND` — the same trust tier as an actual refund, from `/dashboard/orders/[id]`'s "Store credit" section) **and** by customer self-serve card top-up. `Wallet` (fast-read balance) + `WalletTxn` (append-only ledger) in `wallet.model.ts`; `wallet.service.ts`'s `debit` is an atomic conditional update (`balance: {$gte: amount}`, mirroring `checkout.service`'s stock-reservation guard) so concurrent debits can't overdraw it. The actual charge happens **inside `checkout.service.createOrder`**, atomically alongside inventory reservation — not in `WalletProvider.initiate()` (which runs *after* the order already exists, too late to participate in the same rollback). A wallet order is captured immediately (`payment.status`/`order.status: "paid"` at creation), unlike COD (captured on delivery) or Stripe/Paymob (captured via webhook). `/account/wallet` shows balance + history, plus an "Add funds" form (`TopUpForm`) that calls `initiateTopUpAction` → `walletService.initiateTopUp`, which creates a Stripe Checkout Session tagged `metadata.kind: "wallet_topup"` (no `Order` involved). The shared Stripe webhook (`/api/webhooks/stripe`) reads that metadata to branch between `walletService.applyTopUpWebhook` (credits the wallet, idempotent via the same Redis `SET NX` pattern used for order webhooks) and the existing order-payment path — one Stripe account, two independently-idempotent money-in flows on the same endpoint.
- Chat attachments exist in the schema and the send path, but nothing uploads a
  file — there is no storage integration, so the field is unreachable from the UI.
### 6.2 Inventory reservation
`checkout.service` claims stock with a **conditional** update — `{_id, stock: {$gte: qty}}` — so the read and the write are one atomic operation and two concurrent checkouts cannot both take the last unit. A multi-line order rolls back everything it already reserved if any line is refused, and again if the Order insert itself fails. Verified under 10 simultaneous checkouts for 1 unit: exactly one succeeds, stock lands at 0, never negative.

Products with `allowBackorder` (or `trackInventory: false`) are deliberately **not** guarded — those are meant to go negative.

A transaction would also cover the Order insert, but needs a replica set; this keeps the guarantee without that dependency.

### 6.3 Variable products
The parent Product holds the option definitions (`attributes[].variantDefining`) and a denormalized `priceRange`; the Variants hold the real prices and stock. Consequences worth knowing:

- A variable parent's `stock` is **meaningless** (seeded as 0). Availability is the sum of its variants. Anything reading parent stock for a variable product is a bug — this is what made `analytics.lowStock` report every variable product as "0 left" until it was taught to aggregate variants.
- Listings show `from {priceRange.min}`; cards and quick view set `isVariable` and offer "Choose options" instead of an add-to-cart the server would reject for want of a `variantId`.
- The picker disables combinations with no backing variant rather than hiding them, so the control doesn't reflow as you choose.

### 6.4 Database maintenance scripts
The Market→Vendor rename left artifacts Mongoose does not clean up on its own:

| Script | Purpose |
|---|---|
| `npm run db:sync-indexes` | Drops indexes the schemas no longer declare (`-- --dry` to preview). The rename orphaned 25 `market_*` indexes, six of them unique — `{market, slug}` on products forced slugs to be globally unique across all vendors, and `{market, number}` on orders would collide the moment a second vendor issued order 1001. |
| `npm run db:cleanup-legacy` | Deletes documents still carrying the old `market` field (invisible to every vendor-scoped query) and rewrites the obsolete `market_admin` role to `vendor`. |
| `npm run seed:reset` | Wipes seeded data — including legacy `demo-store` — and rebuilds. |

Run `db:sync-indexes` after any index change.

Each step ships compiling, typechecked code with real logic — no stubs.

### 6.5 Live delivery tracking
Leaflet + OpenStreetMap, per the maps decision above — no API key, no new
build-time asset (marker icons load from the `leaflet` package's own unpkg
CDN copy rather than being vendored into `public/`).

- Reuses the `order:<id>` socket room that already existed for `order:update`
  — `canReadOrder` in `realtime/server.ts` gained a branch for the order's
  assigned driver (`shipping.driver`), since a courier with no vendor
  Membership couldn't otherwise join the room at all.
- The driver emits `driver:location`; the server **re-verifies the sender is
  specifically the assigned driver on every single emit** (a fresh DB read,
  not just "is this socket in the authorized room" — the customer and vendor
  staff are in the same room and must not be able to spoof a position), then
  relays `order:location` to everyone else in the room.
- The customer's map only ever shows what the socket sends — nothing is
  persisted. A page reload with no live driver connected shows "Waiting for
  the driver's location…", not a stale last-known pin.
- `leaflet` executes browser-only code (`window`) at import time, so the map
  component is behind `next/dynamic(..., { ssr: false })`, which itself
  cannot be called from a Server Component — the actual map lives in
  `delivery-map.tsx`, loaded through a one-line client wrapper,
  `delivery-map-loader.tsx`, that the server page imports instead.
- Not unit-tested — realtime UI, verified live instead (a fake
  `navigator.geolocation.watchPosition` firing manually from a script,
  matching how chat typing/read-receipts were verified in an earlier
  session): watched a driver's simulated position land on the customer's map
  in real time, twice, confirming continuous updates work, not just the
  first one.

### 6.6 i18n / RTL — proper `[locale]` URL segment, ISR restored
`next-intl`, now on a real `app/[locale]/` segment (`/en/...`, `/ar/...`,
`localePrefix: "always"` so the default locale isn't left bare) — the fix
for the ISR regression an earlier, deliberately scoped cookie-only version of
this feature accepted and documented right here. That version is gone; this
section describes the current, corrected setup.

- `src/i18n/routing.ts` — `defineRouting({ locales, defaultLocale,
  localePrefix: "always", localeCookie: { name: "locale" } })`, keeping the
  pre-migration cookie name so an existing visitor's saved preference still
  applies after the rollout.
- `src/i18n/navigation.ts` — `createNavigation(routing)`'s `Link`,
  `useRouter`, `usePathname` (all locale-aware: `usePathname()` returns the
  locale-*stripped* path, `Link`/`router.push` auto-prefix the current
  locale). Every internal `next/link`/`next/navigation` import in the app was
  swapped for these — `notFound` and `useSearchParams` are the two exceptions
  next-intl doesn't wrap, so those still come from `next/navigation` directly.
  Exports a `redirect` wrapper with an explicit `: never` return annotation:
  next-intl's own `redirect` type is `never` by declaration but doesn't
  reliably narrow at `if (!x) redirect(...)` call sites (confirmed via an
  isolated repro), so every one of the ~20 auth-redirect call sites across
  `page.tsx` files was left treating `x` as possibly null afterward until this
  wrapper fixed it in one place.
- `src/i18n/request.ts` — locale now comes from the resolved route segment
  (`requestLocale`, populated by the proxy), not a cookie. This is the actual
  mechanism that restores static generation: a cookie is per-request and
  uncacheable, a path segment is not.
- **`src/proxy.ts`** composes next-intl's `createMiddleware(routing)` with
  this app's pre-existing auth-refresh/protected-route logic in one function
  — Next.js only supports one proxy per project. next-intl's middleware
  resolves/redirects the locale prefix first; the auth checks then run
  against the locale-stripped pathname and re-attach whatever locale was
  resolved to any redirect they build (so `/ar/dashboard` unauthenticated
  bounces to `/ar/login`, not `/en/login`). A fixed prefix list
  (`/auth/google`, `/icons`, `/apple-icon`, `/icon`, `/favicon.ico`,
  `/manifest.webmanifest`, `/sw.js`) is exempted from locale prefixing
  entirely — OAuth callback URLs and PWA icon/manifest routes are referenced
  by fixed, unprefixed URLs and must never move.
- **Static generation needed one more piece beyond the `[locale]` segment
  itself**: `generateStaticParams` on the root `[locale]` layout is necessary
  but not sufficient — next-intl's `requestLocale` still falls back to a
  dynamic per-request signal unless each statically-rendered page (and every
  ancestor layout) calls `setRequestLocale(locale)` before any translation
  call. Without it, every route still showed `ƒ` (dynamic) in the build
  output despite the segment migration. Added to the two root layouts and
  the six storefront leaf pages that carry `revalidate` (home, categories
  list/detail, products, vendor storefront, product detail) — confirmed by
  build output: home and the categories list now show `●` (prerendered per
  locale, `/en` and `/ar` both listed). The catalog pages with their own
  dynamic segment (`[slug]`, `[vendor]`) still show `ƒ` in the listing since
  they were never build-time prerendered even before any of this (no
  `generateStaticParams` for seeded product/vendor slugs) — they still get
  on-demand ISR via `revalidate` at runtime, same as always; that's not a
  regression, just how the build-output table represents "cacheable but not
  pre-built."
- Every page under `dashboard`/`account`/`platform`/`checkout` stays
  `force-dynamic` as before — that was never about locale, it's inherent to
  reading the session cookie.

**Scope is still bounded** to the storefront shell (header, footer, home
page) — the same intentional limit as before. Every other route renders in
whatever locale its URL segment says but has no Arabic message keys yet;
`useTranslations`/`getTranslations` calls elsewhere need their own
namespaces added to `src/i18n/messages/{en,ar}.json` first. Extending
translation coverage is a separate, additive piece of work from the routing
fix this section describes.

RTL is proven, not just declared: `dir="rtl"` flows from `<html>` through
Tailwind's automatic `rtl:`/logical-property support; the notification-badge
position in the header uses `-end-0.5` (logical) instead of `-right-0.5`
(physical) as the one concrete example of a component that actually flips
correctly, rather than just rendering right-to-left text in a still-LTR
layout. Verified live at `/ar` (and via clean `curl` requests with no
cookies, to rule out any client-side state) that `<html lang="ar" dir="rtl">`
renders, translated header/hero text is present, every internal link on the
page carries the `/ar/` prefix, and `/ar/account/profile` unauthenticated
redirects to `/ar/login?next=%2Far%2Faccount%2Fprofile` — the locale survives
the round trip through the login redirect.

---

## 7. Messaging

Four thread shapes, one service. `Conversation.kind` decides who may read a
thread and where it surfaces:

| kind | between | vendor |
|---|---|---|
| `customer_vendor` | shopper ↔ a store's staff | required |
| `admin_vendor` | platform ↔ a store's staff | required |
| `admin_customer` | platform ↔ shopper (support) | null |
| `internal` | staff ↔ super admin | optional |

**Threads are addressed to a side, not to a person.** Any active staff member
holding `ticket:respond` on the vendor can read and answer that vendor's
threads; any super admin can answer platform threads. `participants` records who
has actually taken part — for read receipts and unread counts — and is *not* the
access-control list. `conversationService.assertCanAccess` is the only place
that rule is written.

This is not a stylistic choice. Pinning a shopper's question to one employee
means it goes unanswered the moment that employee is off shift, with no signal to
the shopper that nobody is there. It is also what made the platform inbox render
empty in its first version: a support ticket a customer opens has no admin
participant until one replies, so an inbox filtered by participation showed
nothing while tickets accumulated.

Unread counts are derived by counting messages newer than the viewer's
`lastReadAt`, not stored — a counter would drift, and a wrong badge is worse than
no badge. One `$or`-of-cutoffs aggregation covers a whole inbox page.

### 7.1 Realtime transport
Sending is a **server action**, never a socket emit. The socket only decides
whether the *other* side's replies appear without a refresh, so chat degrades to
a working-but-manual experience when realtime is down rather than breaking. The
composer reports connection state in a status line instead of disabling itself.

Path: server action → `publishRealtime` → Redis pub/sub → standalone Socket.IO
process → room fan-out. Serverless functions cannot hold long-lived connections,
which is why the socket server is a separate process (`npm run realtime`).

Clients authenticate the handshake with a **60-second token** from
`/api/realtime/token`. The session cookie is httpOnly and browser JS cannot hand
it to `io({ auth })`; dropping httpOnly to work around that would expose the real
session to any XSS on the page. The client re-mints on reconnect, because
Socket.IO replays the original handshake and a minute-old token can never
succeed after a longer outage.

**Room authorization is checked against the database on every join.** An earlier
version joined whatever room the client named, under a comment claiming the check
happened server-side — it did not, and any authenticated shopper could join
`vendor:<anyone>` to watch a competitor's live order feed. Membership is
re-queried rather than read from the JWT, since vendor access can be revoked
while a socket is still live on an unexpired token.

There is deliberately no separate socket secret: the socket server verifies with
`JWT_ACCESS_SECRET` because the claims it needs are exactly the access token's.


## 8. Production readiness

What is genuinely done, and what is not. Ordered by what would hurt first.

### 8.1 Blocking
- **Test coverage reaches Stripe but not refunds.** CI runs typecheck, lint, the
  suite, and a build on every push (§9). Stripe signature verification and
  webhook idempotency are now pinned, along with the oversell guard. Refund
  arithmetic, the order status machine, and cart merging are still guarded by
  nothing but the next reader's attention — and those are where money is.
- **Stripe is configured in test mode; Paymob is not configured at all.**
  `enabledProviders()` returns `['cod', 'stripe']`. Going live needs live-mode
  keys and a **production** `STRIPE_WEBHOOK_SECRET` from the dashboard endpoint —
  the CLI's `whsec_` from `stripe listen` is local-only. Without the right
  secret every delivery 400s, and orders stay `pending` after a successful
  payment, because fulfillment is driven by the webhook and never by the
  browser return (which is spoofable).
- **No error tracking or metrics.** `pino` writes structured logs to stdout and
  nothing aggregates them. A 500 in production is invisible unless someone is
  tailing a container.
- **Run `npm run db:sync-indexes` before first deploy** and after any index
  change. Conversation and Message ship new indexes.

### 8.2 Security
Verified present: httpOnly cookies, refresh-token rotation with a Redis
allowlist and reuse detection, per-request auth in every server action,
vendor-scoped guards, webhook signature verification on both providers
(now constant-time), `X-Frame-Options`/`nosniff`/`Referrer-Policy`, input
validation via zod at every boundary, error masking in production.

Outstanding:
- **No Content-Security-Policy.** The other headers are set; CSP is the one that
  actually contains an XSS, and it is absent.
- **Rate limiting covers only auth and chat.** Checkout, password reset, and the
  storefront search/filter endpoints are unthrottled.
- No account lockout after repeated failed logins (rate limiting only).
- Chat has no abuse tooling — no blocking, reporting, or profanity handling. A
  vendor cannot stop a customer from messaging them.

### 8.3 Scaling
- **The Socket.IO server is single-instance.** Redis pub/sub carries events from
  Next into it, so published events reach every instance, but socket-to-socket
  emits (typing, presence, read receipts) do not cross instances. Running more
  than one replica needs `@socket.io/redis-adapter`.
- `catalog.service` resolves active vendors to an id list and matches with `$in`
  — fine now, an aggregation `$lookup` at thousands of vendors.
- Inventory reservation avoids transactions deliberately (§6.2); a replica set
  would let the Order insert join the same atomic unit.
- No CDN/image pipeline: media is remote URLs, `next/image` is limited to three
  allow-listed hosts, and there is no upload path at all.

### 8.4 Operational
- `/api/health` checks Mongo and Redis and returns 503 when degraded — usable as
  a readiness probe.
- No backup or restore procedure is documented.
- No graceful shutdown in the realtime server: it does not drain sockets or close
  the Redis subscriber on SIGTERM, so deploys drop connections abruptly.
- The realtime process must be deployed somewhere that holds long-lived
  connections (container/VM), not on serverless.

---

## 9. Testing

`npm test` (vitest, `test/`). CI runs typecheck → lint → tests → build on every
push and pull request (`.github/workflows/ci.yml`), with Mongo and Redis as
service containers.

**Tests run against real MongoDB and Redis, not mocks.** Almost every invariant
worth protecting here is a database behaviour: the oversell guard is a
conditional update that two writers must genuinely race on, tenant isolation is
a query filter, unread counts are an aggregation. A mocked driver would assert
that the mock behaves as written and leave all three unverified.

The cost is that a test run needs both services up. `test/setup.ts` handles
isolation:

- Mongo goes to `commerce_test`, and the run **aborts** if the resolved database
  name does not contain `test` — the per-test wipe would otherwise delete
  development data.
- Redis keys are namespaced with `REDIS_KEY_PREFIX` (`vitest:`), and only keys
  under that prefix are deleted. **Do not "simplify" this to a separate logical
  database.** An earlier version pointed tests at database 1 and flushed it,
  which silently destroyed development data: hosted Redis (Redis Cloud, Upstash)
  exposes only database 0, so `SELECT 1` fails, ioredis merely logs the error,
  and the client carries on using database 0 — where the flush then lands. The
  worst casualty is `vendor:{id}:order_seq`; wiping it restarts order numbering
  at 1001 while orders with those numbers still exist, and `{vendor, number}` is
  unique, so the next checkout fails on a duplicate key. A prefix cannot fail
  that way: if it is not applied, the cleanup finds nothing rather than deleting
  someone else's keys.
- `.env.local` is loaded by hand (vitest has no `--env-file`, and Vite only
  exposes prefixed variables), *before* the test overrides are applied.
- Collections are emptied between tests rather than dropped, because dropping
  takes the indexes with it and some assertions depend on a unique index
  actually rejecting a duplicate.

Suites do not run in parallel: they share one database.

### 9.1 What is covered
| Suite | Protects |
|---|---|
| `conversation-access.test.ts` | Who can read and write a thread — participants, the vendor shared-inbox rule, cross-vendor refusal, revoked memberships, super admin. The socket server's room joins call the same guard. |
| `checkout-oversell.test.ts` | Stock never goes negative; ten concurrent buyers racing for one unit produce exactly one winner. Also pins the deliberate exceptions (backorder, `trackInventory: false`) so they are not "fixed" away. |
| `order-refund.test.ts` | Refund arithmetic — validation, tenant isolation, partial vs full, stock released once and only on a full refund, and provider-initiated refunds by webhook. The two float-exactness cases are regressions for real bugs (§9.3). |
| `stripe-webhook.test.ts` | Signature verification (wrong secret, tampered body, missing header, stale timestamp) and **idempotency** — a duplicate delivery must not increment vendor revenue twice. Also that a failed payment releases reserved stock. No network: `constructEvent` is HMAC verification, so it runs in CI with a dummy key. |
| `pricing.test.ts` | Coupon and tax arithmetic — each discount kind and its caps, tax applying to the *discounted* subtotal and not to shipping, free shipping, an over-generous fixed coupon settling the cart without going negative, and the stored parts reconciling against the grand total. `validateCoupon` is covered against a real database for expiry, activation window, usage limit, minimum spend, case folding, vendor scoping, per-user limit (counting prior non-cancelled orders, not enforced for guests), and product/category scope (discounting only the targeted lines, refused when it reaches nothing) — and `resolveCouponForPreview` is pinned to agree with it on every outcome (§9.4). |

### 9.2 What is not
Auth and token rotation, the Paymob adapter, the order status machine, cart
merging on login, and every React component.

Vendors author coupons from **`/dashboard/coupons`** (`coupon:write`, i.e. Vendor
Admin, Marketing, or Super Admin). The screen lists a vendor's coupons and
creates/edits/deletes them through `couponService`; the form exposes every
constraint field — type, value/cap, min spend, total and per-user limits, the
active window, and the product/category scope, checkboxes over that vendor's own
catalogue. Delete is a soft delete (orders keep the code as a string); the
`{vendor, code}` unique index counts soft-deleted rows, so re-creating a deleted
code revives that row rather than colliding. Covered by `coupon-service.test.ts`.

Both coupon constraints that were once stored-but-ignored are now **enforced**
(`pricing.service`, covered in `pricing.test.ts`):
- `perUserLimit` — `validateCoupon` counts the shopper's prior non-cancelled
  orders carrying the code and refuses once the limit is reached. It is only
  enforceable for a signed-in shopper; a guest has no durable identity to count,
  so the limit does not apply to guest checkout.
- `appliesToProducts` / `appliesToCategories` — when either is set, the discount
  applies to *only* the cart lines the coupon targets (`discountableSubtotal`),
  and the coupon is refused outright if it reaches nothing in the cart. `minSpend`
  still measures the whole cart, not the targeted subset. Cart lines carry the
  product id and its categories so the cart preview and checkout agree.

### 9.3 Money arithmetic
`Order.totals` and every price are **stored** as JavaScript numbers. A single
stored value is fine — 129.99 round-trips exactly — but summing and comparing
them is not, and that is where every money bug here has come from: partials
summing to 1.0499999999999998 against a 1.05 total, and a remaining balance of
0.9299999999999999 rejecting a 0.93 refund.

**All money computation goes through `shared/lib/money.ts` in integer cents.**
`Minor` is a branded number, so TypeScript's arithmetic operators erase the
brand — `a + b` on two `Minor` values yields a plain `number` that will not
assign back to a `Minor`. Raw float arithmetic on money therefore does not
compile; the helpers are the only way through, and they are exact. That covers
pricing, cart subtotals, checkout line totals, refunds, and both payment
adapters.

Two known limits:
- `toMinor` expects amounts that are already whole cents. Half-cent inputs
  cannot be rounded predictably — 1.005 rounds down, 8.115 rounds up — because
  the value lost the information before it arrived. The precondition holds while
  totals are rounded before storage.
- `vendor.stats.revenue` was **removed**. It accumulated with `$inc` *inside
  Mongo*, so it drifted and JS-side exactness could not reach it, and nothing
  read it — the dashboard's revenue comes from `analyticsService` aggregating
  `totals.grandTotal` over paid orders, which is authoritative. A wrong number
  nobody read was pure liability, so the field and its write are gone rather than
  displayed. If a fast denormalized total is ever wanted, store minor units and
  reconcile against the aggregation. (Old vendor documents may still carry the
  field on disk; it is undeclared now, so Mongoose ignores it.)

Storing minor units at rest would remove the conversion boundary entirely. That
is a data migration across ~41 files and has not been done.

### 9.4 One subtotal, one coupon check
The subtotal is not just a number to display: it decides whether a coupon's
minimum spend is met, and that check runs *before* `computeTotals` does. It was
computed two different ways — `cart.service` in exact cents, `checkout.service`
with a plain float reduce — and a cart of 0.35 and 0.70 sums to
1.0499999999999998 in the second, refusing a coupon on a cart that meets its
1.05 minimum. `subtotalOf()` is now the only way to sum lines, and all three
call sites use it.

The same principle applies to coupon *validity*. The cart preview resolved the
stored coupon with a `findOne` on `isActive` alone, while checkout ran the full
`validateCoupon`. An expired or exhausted coupon therefore kept showing a
discount on the cart page that checkout refused at the moment of payment.
`resolveCouponForPreview()` now runs exactly the check checkout runs and simply
returns null where checkout throws, since a preview has nobody to report an
error to. A test asserts the two agree on every outcome.

The rule both cases point at: **when the customer is shown a number and later
charged one, the two must come from the same code.** A second implementation of
"the same" calculation is where they drift apart.

There are no end-to-end browser tests. The messaging flows were verified by
hand against a running dev server and socket process, which is not a substitute.
