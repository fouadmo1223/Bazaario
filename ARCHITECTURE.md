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
8. ⏳ **Realtime & Notifications** — Socket.IO server with database-checked room authorization; chat (Conversation/Message) wired end-to-end across shopper, vendor, and admin inboxes. *(Notification bell UI and email fallback for offline recipients still outstanding.)*
9. ⏳ **Storefront UI** — marketplace home, `/products` with URL-driven filters (category, brand, price, rating, stock, sort), category browse, wishlist (model + service + actions + UI, guest-capable and merged on login), per-store cart overview, quick-view modal. *(CMS / marketing / reviews / support still outstanding.)*
10. ⏳ **Dashboards & Analytics** — vendor dashboard + Recharts exist; product management UI (`/dashboard/products`: list, create, edit, delete) landed; SEO done for storefront; i18n/RTL and PWA outstanding.
11. ⏳ **Hardening** — rate limiting + audit logs + sanitize in place; vitest suite (§9) and GitHub Actions CI running typecheck, lint, tests, and build. *(Coverage is still narrow — see §9.1.)*

### 6.1 Known gaps
- **Test coverage is narrow.** A suite exists (§9) and covers the two invariants most likely to be broken silently — conversation access control and the oversell guard — but auth, payments, refunds, cart merging, and the order status machine are still unprotected.
- Customers cannot yet reorder, return, or download an invoice; drivers have no UI at all.
- Stack items from the brief not yet installed: shadcn/ui, TanStack Query, React Hook Form, Zustand, Lenis, Cloudinary/Sharp, next-intl, next-themes, Leaflet. Current UI is hand-rolled Tailwind v4 (GSAP is installed and drives the storefront reveal animations).
- The vendor product editor (`/dashboard/products`) covers create, edit, and delete for simple and variable products, but the variant matrix itself is still API-only (`syncVariantsAction`) — a variable product can be declared in the UI and not yet given its variants there.
- `catalog.service` resolves active vendors to an id list and matches with `$in`. Fine at this size; becomes a problem at thousands of vendors, where it should be an aggregation `$lookup`.
- Wallet payment provider is declared in the registry but unimplemented (`null`).
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

There is **no vendor-facing coupon CRUD** yet: coupons are created only by the
seed (or directly in the database). The storefront has a code-entry form; the
dashboard has no screen to author or edit a coupon. So while every constraint
below is enforced, only a seeded/DB-created coupon can carry the fields that
exercise them.

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
- `vendor.stats.revenue` accumulates with `$inc` *inside Mongo*, so it drifts
  and JS-side exactness cannot reach it. It is currently written but never read
  (analytics aggregates orders instead). Make it exact or drop it before
  displaying it.

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
