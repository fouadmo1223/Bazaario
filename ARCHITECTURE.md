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
A standalone Socket.IO server (`server/realtime`) run as a Vercel-external Node service (or long-running container), since Vercel serverless can't hold sockets. Auth via short-lived socket JWT. Rooms: `vendor:{id}`, `order:{id}`, `user:{id}`, `ticket:{id}`. Redis adapter for horizontal scale + pub/sub between serverless actions and the socket server.

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
                fulfillment, refunds[]
Address         user, label, recipient, phone, lines, city, region, country, geo
Coupon          vendor, code, type, value, constraints{minSpend,usageLimit,perUser,window}
Review          vendor, product, customer, rating, title, body, status, media[]
Ticket          vendor, customer, subject, status, priority, messages[]
Notification    user, vendor?, type, channel, payload, readAt
WalletTxn       user, vendor?, type(credit|debit), amount, reason, ref
LoyaltyLedger   user, vendor, points, reason, ref
CmsPage/Banner/Blog/Menu   vendor-scoped content
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
Orders    action: updateStatus, refund, cancel, addNote
Search    GET  /api/search?q=  (debounced client, Redis-cached facets)
Realtime  socket events: notification, order:update, chat:message, presence
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
7. ⏳ **Orders & Delivery** — lifecycle + refunds wired end-to-end: customer history (`/account/orders`), vendor dashboard (`/dashboard/orders`) with status-machine-driven transitions and refunds. *(Driver flows, returns, and tracking UI still outstanding.)*
8. ⏳ **Realtime & Notifications** — Socket.IO server exists; no UI surface yet.
9. ⏳ **Storefront UI** — marketplace home, `/products` with URL-driven filters (category, brand, price, rating, stock, sort), category browse, wishlist (model + service + actions + UI, guest-capable and merged on login), per-store cart overview, quick-view modal. *(CMS / marketing / reviews / support still outstanding.)*
10. ⏳ **Dashboards & Analytics** — vendor dashboard + Recharts exist; product management UI (`/dashboard/products`: list, create, edit, delete) landed; SEO done for storefront; i18n/RTL and PWA outstanding.
11. ⏳ **Hardening** — rate limiting + audit logs + sanitize in place; **no test suite, no CI/CD** yet.

### 6.1 Known gaps
- **No automated tests.** Verification to date is typecheck + lint + build + throwaway service-level runtime scripts. Those scripts proved the money, transition, and isolation paths but were deleted after each run — they should become a real suite.
- Customers cannot yet reorder, return, or download an invoice; drivers have no UI at all.
- Stack items from the brief not yet installed: shadcn/ui, TanStack Query, React Hook Form, Zustand, Lenis, Cloudinary/Sharp, next-intl, next-themes, Leaflet. Current UI is hand-rolled Tailwind v4 (GSAP is installed and drives the storefront reveal animations).
- The vendor product editor (`/dashboard/products`) covers create, edit, and delete for simple and variable products, but the variant matrix itself is still API-only (`syncVariantsAction`) — a variable product can be declared in the UI and not yet given its variants there.
- `catalog.service` resolves active vendors to an id list and matches with `$in`. Fine at this size; becomes a problem at thousands of vendors, where it should be an aggregation `$lookup`.
- Wallet payment provider is declared in the registry but unimplemented (`null`).

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
