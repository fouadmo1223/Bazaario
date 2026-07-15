# Multi-Market Commerce Platform — Architecture & Design

> Status: living document. This is the design that every implementation increment is built against.
> Stack baseline verified against installed versions: **Next.js 16.2.10 (App Router)**, **React 19.2**, TypeScript strict.
> Platform note: In Next.js 16, **Middleware was renamed to `proxy.ts`** — the platform uses it only for _optimistic_ edge checks, never as the authorization source of truth.

---

## 1. System Architecture

### 1.1 Shape
A single Next.js App-Router application (deployed on Vercel) that serves three surfaces from one codebase, separated by route groups:

| Surface | Route group | Audience |
|---|---|---|
| Storefront | `(storefront)` | Guests, Customers |
| Market dashboard | `(dashboard)` | Market Admin, Marketing, Support, Delivery Driver |
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
A standalone Socket.IO server (`server/realtime`) run as a Vercel-external Node service (or long-running container), since Vercel serverless can't hold sockets. Auth via short-lived socket JWT. Rooms: `market:{id}`, `order:{id}`, `user:{id}`, `ticket:{id}`. Redis adapter for horizontal scale + pub/sub between serverless actions and the socket server.

### 1.4 Caching strategy
- **Redis**: sessions/refresh-token allowlist, rate-limit counters, cart TTL for guests, hot product reads, search facets, idempotency keys.
- **Next cache**: ISR for storefront product/category pages, tag-based revalidation (`revalidateTag('market:{id}:products')`) on mutation.
- **CDN**: Cloudinary for media (Sharp only for pre-upload normalization).

---

## 2. Data Model (MongoDB / Mongoose)

### 2.1 Cross-cutting conventions (applied to every schema via a base plugin)
- `timestamps: true` (createdAt / updatedAt)
- Soft delete: `deletedAt: Date | null`, `isDeleted` virtual, default query filter excludes deleted.
- Audit: `createdBy`, `updatedBy` (ObjectId → User).
- `toJSON`/`toObject`: virtuals on, `__v` stripped, `_id`→`id`.
- Multi-market isolation: every market-owned document carries `market: ObjectId` **indexed**, and all repository queries are market-scoped by a mandatory `marketId` argument.
- Pagination: shared `paginate()` helper (cursor + offset variants).

### 2.2 Core collections
```
User            _id, email(uniq), passwordHash, name, avatar, roles[], status,
                emailVerifiedAt, providers[{provider,sub}], defaultMarket?
Market          _id, name, slug(uniq), owner→User(one Market Admin), status,
                currency, locales[], settings{...}, theme, domains[]
Membership      user, market, role(enum), permissions[] (RBAC grant per market)
Category        market, name, slug, parent?, path[], seo
Brand           market, name, slug, logo
Product         market, type(simple|variable), title, slug, description, brand?,
                categories[], tags[], attributes[], seo, media[], status,
                price/compareAt (simple), ratingAvg, ratingCount
Variant         product, market, sku(uniq per market), barcode, options{},
                price, compareAt, stock, weight, dimensions, media[]
Inventory       market, variant, onHand, reserved, backorder policy, lowStockAt
Cart            market, user?|guestToken, items[{variant,qty,priceSnapshot}], coupon?
Order           market, number, customer, items[snapshot], totals{sub,tax,ship,disc,grand},
                status, timeline[], payment{provider,status,ref}, shipping{addr,method,slot},
                fulfillment, refunds[]
Address         user, label, recipient, phone, lines, city, region, country, geo
Coupon          market, code, type, value, constraints{minSpend,usageLimit,perUser,window}
Review          market, product, customer, rating, title, body, status, media[]
Ticket          market, customer, subject, status, priority, messages[]
Notification    user, market?, type, channel, payload, readAt
WalletTxn       user, market?, type(credit|debit), amount, reason, ref
LoyaltyLedger   user, market, points, reason, ref
CmsPage/Banner/Blog/Menu   market-scoped content
AuditLog        actor, market?, action, entity, entityId, diff, ip, ua, at
```

### 2.3 Key relationships & indexes
- `Product.market + slug` unique compound; `Variant.market + sku` unique.
- `Order.market + number` unique; `Order.market + status + createdAt` for dashboards.
- `Membership.user + market` unique (enforces one role record per user per market; **Market has exactly one owner** enforced at `Market.owner` + a service invariant).
- Text index on `Product.title/description/tags` for full-text search (Atlas Search upgrade path noted).

---

## 3. Folder Structure (feature-based)
```
src/
  app/                      # routing only — thin
    (storefront)/  (dashboard)/  (platform)/  (auth)/
    api/                    # route handlers (webhooks, uploads, health)
  features/                 # vertical slices: ui + hooks + actions per domain
    auth/ products/ cart/ checkout/ orders/ markets/ reviews/ cms/ ...
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
Products  action: create/update/delete/publish (market-scoped)   read: RSC + repo
Cart      action: add/update/remove/merge   GET /api/cart (guest hydrate)
Checkout  action: createOrder → payment intent
Payments  POST /api/webhooks/{stripe,paymob}   (signature-verified, idempotent)
Uploads   POST /api/uploads (signed Cloudinary)  Sharp pre-process
Orders    action: updateStatus, refund, cancel, addNote
Search    GET  /api/search?q=  (debounced client, Redis-cached facets)
Realtime  socket events: notification, order:update, chat:message, presence
Health    GET  /api/health  (db+redis probes)
```

---

## 5. RBAC / Permissions Matrix
Roles: `guest, customer, market_admin, marketing, support, delivery_driver, super_admin`.
Model = **role → permission set**, evaluated **within a market scope** (except super_admin which is global). Permissions are `resource:action` strings; guards run in services (source of truth) and optimistically in `proxy.ts`.

| Capability (resource:action) | guest | customer | delivery | support | marketing | market_admin | super_admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| catalog:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cart:write / order:create | ➖ | ✅ | – | – | – | – | ✅ |
| order:read (own) | – | ✅ | – | – | – | – | ✅ |
| order:read (market) | – | – | assigned | ✅ | ✅ | ✅ | ✅ |
| order:fulfill / delivery:update | – | – | ✅ | – | – | ✅ | ✅ |
| product:write / inventory:write | – | – | – | – | – | ✅ | ✅ |
| coupon:write / campaign:write | – | – | – | – | ✅ | ✅ | ✅ |
| ticket:respond | – | own | – | ✅ | – | ✅ | ✅ |
| cms:write / analytics:read | – | – | – | – | ✅ | ✅ | ✅ |
| market:create/suspend/assign_admin | – | – | – | – | – | – | ✅ |
| platform:settings / users:manage / audit:read | – | – | – | – | – | – | ✅ |

Isolation guarantee: a `market_admin` token is bound to their `market` via `Membership`; every service call re-checks `membership.market === resource.market`. No cross-market read path exists.

> **Maps decision:** Standardized on **Leaflet + OpenStreetMap** (free, no API key) for delivery zones and live tracking. Mapbox dropped to avoid a token dependency.

---

## 6. Build Order (implementation roadmap)
1. **Foundation** *(this increment)* — env validation, DB/Redis clients, base schema plugin, logger, typed errors, API-response + result helpers, RBAC constants, tooling (prettier/eslint/husky/commitlint).
2. **Auth & RBAC** — User/Membership models, password/JWT/refresh, register/login/verify/OTP, `proxy.ts`, guards.
3. **Markets & tenancy** — Market model, provisioning, admin assignment, scoping middleware.
4. **Catalog** — Category/Brand/Product/Variant/Inventory + repositories + storefront reads.
5. **Cart & Checkout** — cart (guest+user+merge), coupons, taxes, shipping, order creation.
6. **Payments** — Stripe + Paymob + COD strategy adapters + webhooks + idempotency.
7. **Orders & Delivery** — lifecycle, refunds/returns, driver flows, tracking.
8. **Realtime & Notifications** — Socket.IO server, in-app/email notifications.
9. **CMS / Marketing / Reviews / Support**.
10. **Dashboards & Analytics** (Recharts), SEO, i18n/RTL, PWA.
11. **Hardening** — rate limiting, CSRF, sanitize, audit logs, tests, CI/CD, Docker.

Each step ships compiling, typechecked code with real logic — no stubs.
