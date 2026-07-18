/**
 * Development seed. Idempotent — safe to run repeatedly.
 * Usage: `npm run seed`   (add `--reset` to wipe seeded data and rebuild)
 *
 * Creates every role, two vendors with their own catalogues, categories,
 * brands, coupons, and a mix of simple and variable products so the storefront,
 * variant picker, cart, checkout, and dashboards all have real data to work on.
 */
import { connectToDatabase } from "./connection";
import {
  User,
  Vendor,
  Membership,
  Brand,
  Category,
  Product,
  Variant,
  Coupon,
  Cart,
  Wishlist,
  Order,
} from "./models";
import { hashPassword } from "@/server/security/password";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { getRedis } from "@/server/cache/redis";
import mongoose, { type Types } from "mongoose";

const RESET = process.argv.includes("--reset");

// ---------------------------------------------------------------------------
// Accounts — every role, one password rule, all printed at the end.
// ---------------------------------------------------------------------------
const PASSWORD = "Passw0rd!";

const ACCOUNTS = {
  superAdmin: { email: "admin@commerce.local", name: "Super Admin", roles: [ROLES.SUPER_ADMIN] },
  vendorOwner: { email: "vendor@commerce.local", name: "Nova Vendor Admin", roles: [ROLES.CUSTOMER, ROLES.VENDOR] },
  vendorOwner2: { email: "vendor2@commerce.local", name: "Atlas Vendor Admin", roles: [ROLES.CUSTOMER, ROLES.VENDOR] },
  customer: { email: "customer@commerce.local", name: "Casey Customer", roles: [ROLES.CUSTOMER] },
  driver: { email: "driver@commerce.local", name: "Dana Driver", roles: [ROLES.CUSTOMER, ROLES.DELIVERY_DRIVER] },
  support: { email: "support@commerce.local", name: "Sam Support", roles: [ROLES.CUSTOMER, ROLES.SUPPORT] },
  marketing: { email: "marketing@commerce.local", name: "Morgan Marketing", roles: [ROLES.CUSTOMER, ROLES.MARKETING] },
} satisfies Record<string, { email: string; name: string; roles: Role[] }>;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
type SimpleSpec = {
  kind: "simple";
  title: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  category: string;
  brand: string;
  tags: string[];
  featured?: boolean;
  rating?: [number, number]; // [avg, count]
  description: string;
};

type VariableSpec = {
  kind: "variable";
  title: string;
  category: string;
  brand: string;
  tags: string[];
  featured?: boolean;
  rating?: [number, number];
  description: string;
  attributes: { name: string; values: string[] }[];
  /** Variant price/stock overrides keyed by "Value / Value" in attribute order. */
  variants: { options: string[]; price: number; compareAtPrice?: number | null; stock: number }[];
};

type Spec = SimpleSpec | VariableSpec;

const NOVA_PRODUCTS: Spec[] = [
  {
    kind: "simple", title: "Aurora Wireless Headphones", price: 129.99, compareAtPrice: 179.99,
    stock: 24, category: "audio", brand: "nova", tags: ["audio", "wireless"], featured: true, rating: [4.6, 128],
    description: "Immersive sound with active noise cancellation and 30-hour battery life.",
  },
  {
    kind: "simple", title: "Pulse Bluetooth Speaker", price: 74.5, compareAtPrice: 99,
    stock: 40, category: "audio", brand: "nova", tags: ["audio", "portable"], featured: true, rating: [4.3, 64],
    description: "Room-filling sound in a bag-sized package. IPX7 water resistant.",
  },
  {
    kind: "simple", title: "Vertex Mechanical Keyboard", price: 149, compareAtPrice: 199,
    stock: 0, category: "computing", brand: "vertex", tags: ["computing"], featured: true, rating: [4.8, 210],
    description: "Hot-swappable switches, aluminium body, per-key RGB.",
  },
  {
    kind: "simple", title: "Nimbus Laptop Sleeve", price: 34, compareAtPrice: 45,
    stock: 60, category: "accessories", brand: "nimbus", tags: ["accessories"], rating: [4.1, 33],
    description: "Water-resistant 14-inch sleeve with a felt interior.",
  },
  {
    kind: "simple", title: "Solstice Desk Lamp", price: 59, stock: 3,
    category: "home", brand: "nova", tags: ["home", "lighting"], rating: [4.4, 51],
    description: "Adjustable warm-to-cool LED lamp with touch dimming.",
  },
  {
    kind: "simple", title: "Cobalt Water Bottle", price: 24.99, stock: 120,
    category: "outdoors", brand: "nimbus", tags: ["outdoors"], rating: [4.7, 88],
    description: "Vacuum-insulated 750ml bottle; keeps drinks cold for 24 hours.",
  },
  {
    kind: "simple", title: "Halo Wireless Charger", price: 39.99, compareAtPrice: 54.99,
    stock: 75, category: "accessories", brand: "nova", tags: ["accessories", "wireless"], rating: [4.0, 42],
    description: "15W Qi charging pad with a non-slip base.",
  },
  {
    kind: "simple", title: "Quartz Mouse Pad XL", price: 19.5, stock: 200,
    category: "computing", brand: "vertex", tags: ["computing"], rating: [4.2, 19],
    description: "900×400mm stitched-edge desk mat.",
  },
  // ---- Variable products: these exercise the variant picker ----------------
  {
    kind: "variable", title: "Terra Running Shoes", category: "footwear", brand: "terra",
    tags: ["footwear", "running"], featured: true, rating: [4.5, 156],
    description: "Lightweight trail runners with responsive cushioning.",
    attributes: [
      { name: "Size", values: ["7", "8", "9", "10", "11"] },
      { name: "Colour", values: ["Black", "Sand", "Forest"] },
    ],
    variants: [
      { options: ["7", "Black"], price: 89.5, stock: 6 },
      { options: ["8", "Black"], price: 89.5, stock: 12 },
      { options: ["9", "Black"], price: 89.5, stock: 0 },
      { options: ["10", "Black"], price: 89.5, stock: 4 },
      { options: ["11", "Black"], price: 94.5, stock: 2 },
      { options: ["8", "Sand"], price: 89.5, compareAtPrice: 109.5, stock: 9 },
      { options: ["9", "Sand"], price: 89.5, compareAtPrice: 109.5, stock: 3 },
      { options: ["10", "Sand"], price: 89.5, compareAtPrice: 109.5, stock: 0 },
      { options: ["8", "Forest"], price: 99.5, stock: 5 },
      { options: ["9", "Forest"], price: 99.5, stock: 7 },
      // Note: no 7/Sand, 7/Forest, 11/Sand, 11/Forest — the picker must disable
      // those combinations rather than offer an add that would fail.
    ],
  },
  {
    kind: "variable", title: "Drift Merino Tee", category: "apparel", brand: "terra",
    tags: ["apparel"], featured: true, rating: [4.4, 74],
    description: "Featherweight merino wool tee that resists odour for days.",
    attributes: [
      { name: "Size", values: ["S", "M", "L", "XL"] },
      { name: "Colour", values: ["Charcoal", "Oat"] },
    ],
    variants: [
      { options: ["S", "Charcoal"], price: 54, stock: 10 },
      { options: ["M", "Charcoal"], price: 54, stock: 14 },
      { options: ["L", "Charcoal"], price: 54, stock: 8 },
      { options: ["XL", "Charcoal"], price: 58, stock: 0 },
      { options: ["S", "Oat"], price: 54, stock: 5 },
      { options: ["M", "Oat"], price: 54, stock: 0 },
      { options: ["L", "Oat"], price: 54, stock: 6 },
      { options: ["XL", "Oat"], price: 58, stock: 3 },
    ],
  },
];

const ATLAS_PRODUCTS: Spec[] = [
  {
    kind: "simple", title: "Atlas Cast Iron Skillet", price: 45, compareAtPrice: 60,
    stock: 30, category: "kitchen", brand: "atlas", tags: ["kitchen"], featured: true, rating: [4.9, 302],
    description: "Pre-seasoned 12-inch skillet that outlives its owner.",
  },
  {
    kind: "simple", title: "Ember Pour-Over Set", price: 68, stock: 18,
    category: "kitchen", brand: "atlas", tags: ["kitchen", "coffee"], featured: true, rating: [4.6, 91],
    description: "Borosilicate carafe, steel filter, no paper required.",
  },
  {
    kind: "simple", title: "Grove Chopping Board", price: 32, stock: 44,
    category: "kitchen", brand: "grove", tags: ["kitchen"], rating: [4.3, 27],
    description: "End-grain walnut board with a juice groove.",
  },
  {
    kind: "simple", title: "Fern Ceramic Planter", price: 28, compareAtPrice: 36,
    stock: 65, category: "home", brand: "grove", tags: ["home", "garden"], rating: [4.5, 58],
    description: "Matte stoneware planter with a drainage tray.",
  },
  {
    kind: "simple", title: "Linen Throw Blanket", price: 89, stock: 12,
    category: "home", brand: "grove", tags: ["home"], rating: [4.7, 40],
    description: "Stonewashed European linen, softens with every wash.",
  },
  {
    kind: "variable", title: "Harbor Enamel Mug", category: "kitchen", brand: "atlas",
    tags: ["kitchen", "outdoors"], rating: [4.2, 63],
    description: "Chip-resistant enamel over steel. Campfire safe.",
    attributes: [
      { name: "Size", values: ["350ml", "500ml"] },
      { name: "Colour", values: ["Navy", "Cream", "Rust"] },
    ],
    variants: [
      { options: ["350ml", "Navy"], price: 18, stock: 25 },
      { options: ["350ml", "Cream"], price: 18, stock: 30 },
      { options: ["350ml", "Rust"], price: 18, stock: 0 },
      { options: ["500ml", "Navy"], price: 22, stock: 15 },
      { options: ["500ml", "Cream"], price: 22, stock: 11 },
      { options: ["500ml", "Rust"], price: 22, stock: 4 },
    ],
  },
];

const CATEGORY_NAMES: Record<string, string> = {
  audio: "Audio",
  computing: "Computing",
  accessories: "Accessories",
  home: "Home",
  outdoors: "Outdoors",
  footwear: "Footwear",
  apparel: "Apparel",
  kitchen: "Kitchen",
};

const BRAND_NAMES: Record<string, string> = {
  nova: "Nova",
  vertex: "Vertex",
  nimbus: "Nimbus",
  terra: "Terra",
  atlas: "Atlas",
  grove: "Grove",
};

const VENDORS = [
  {
    slug: "nova-electronics",
    name: "Nova Electronics",
    description: "Audio, computing, and the small things that make them better.",
    ownerKey: "vendorOwner" as const,
    currency: "USD",
    products: NOVA_PRODUCTS,
    coupons: [
      { code: "WELCOME10", type: "percentage", value: 10, minSpend: 0, maxDiscount: 50 },
      { code: "SAVE20", type: "fixed", value: 20, minSpend: 100 },
      { code: "FREESHIP", type: "free_shipping", value: 0, minSpend: 0 },
    ],
  },
  {
    slug: "atlas-home",
    name: "Atlas Home & Kitchen",
    description: "Hard-wearing kit for the kitchen and the room it opens onto.",
    ownerKey: "vendorOwner2" as const,
    currency: "USD",
    products: ATLAS_PRODUCTS,
    coupons: [{ code: "ATLAS15", type: "percentage", value: 15, minSpend: 50, maxDiscount: 40 }],
  },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Deterministic placeholder imagery so a reseed doesn't reshuffle every photo. */
const mediaFor = (slug: string, count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    url: `https://picsum.photos/seed/${slug}-${i}/900/900`,
    type: "image" as const,
    alt: null,
    width: 900,
    height: 900,
  }));

async function upsertUser(spec: { email: string; name: string; roles: Role[] }) {
  const existing = await User.findOne({ email: spec.email });
  if (existing) {
    // Keep roles current when the seed's definition changes.
    existing.roles = spec.roles as never;
    await existing.save();
    return existing;
  }
  return User.create({
    email: spec.email,
    name: spec.name,
    passwordHash: await hashPassword(PASSWORD),
    roles: spec.roles,
    status: "active",
    emailVerifiedAt: new Date(),
  });
}

/**
 * Remove everything this seed creates, so `--reset` gives a clean rebuild.
 *
 * `LEGACY_SLUGS` matters: earlier seeds shipped a "demo-store" vendor, and a
 * reset that only knows today's vendors leaves those products behind to collide
 * on slug. A reset that doesn't actually reset is worse than none.
 */
const LEGACY_SLUGS = ["demo-store"];
const LEGACY_EMAILS = ["owner@commerce.local"];

async function reset() {
  const emails = [...Object.values(ACCOUNTS).map((a) => a.email), ...LEGACY_EMAILS];
  const users = await User.find({ email: { $in: emails } }).select("_id");
  const userIds = users.map((u) => u._id);
  const vendors = await Vendor.find({
    slug: { $in: [...VENDORS.map((v) => v.slug), ...LEGACY_SLUGS] },
  }).select("_id");
  const vendorIds = vendors.map((v) => v._id);

  const opts = { withDeleted: true } as never;
  await Promise.all([
    Order.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Variant.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Product.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Category.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Brand.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Coupon.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Cart.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Membership.deleteMany({ vendor: { $in: vendorIds } }).setOptions(opts),
    Wishlist.deleteMany({ user: { $in: userIds } }).setOptions(opts),
  ]);
  await Vendor.deleteMany({ _id: { $in: vendorIds } }).setOptions(opts);
  await User.deleteMany({ _id: { $in: userIds } }).setOptions(opts);

  // Order numbers come from Redis counters; leaving them would resume mid-series.
  const redis = getRedis();
  const keys = await redis.keys("vendor:*:order_seq");
  const catalogKeys = await redis.keys("catalog:*");
  if (keys.length || catalogKeys.length) await redis.del(...keys, ...catalogKeys);

  console.log("→ Reset: removed previously seeded data");
}

async function seedProduct(
  spec: Spec,
  ctx: {
    vendorId: Types.ObjectId;
    ownerId: Types.ObjectId;
    categories: Map<string, Types.ObjectId>;
    brands: Map<string, Types.ObjectId>;
  },
): Promise<"created" | "skipped"> {
  const slug = slugify(spec.title);
  if (await Product.findOne({ vendor: ctx.vendorId, slug })) return "skipped";

  // Both maps are built from these same specs, so a miss means the spec names a
  // category/brand that doesn't exist — a seed bug worth failing on, not one to
  // paper over with a product that lands uncategorised.
  const categoryId = ctx.categories.get(spec.category);
  const brandId = ctx.brands.get(spec.brand);
  if (!categoryId) throw new Error(`"${spec.title}" references unknown category "${spec.category}"`);
  if (!brandId) throw new Error(`"${spec.title}" references unknown brand "${spec.brand}"`);

  const base = {
    vendor: ctx.vendorId,
    title: spec.title,
    slug,
    description: spec.description,
    shortDescription: spec.description,
    brand: brandId,
    categories: [categoryId],
    tags: spec.tags,
    trackInventory: true,
    status: "active" as const,
    featured: spec.featured ?? false,
    publishedAt: new Date(),
    createdBy: ctx.ownerId,
    ratingAvg: spec.rating?.[0] ?? 0,
    ratingCount: spec.rating?.[1] ?? 0,
    media: mediaFor(slug),
    seo: { title: `${spec.title} · Commerce`, description: spec.description, keywords: spec.tags },
  };

  if (spec.kind === "simple") {
    await Product.create({
      ...base,
      type: "simple",
      price: spec.price,
      compareAtPrice: spec.compareAtPrice ?? null,
      stock: spec.stock,
      sku: slug.toUpperCase().slice(0, 12),
      faqs: [
        { question: "What's the return window?", answer: "30 days, unused and in original packaging." },
        { question: "Is there a warranty?", answer: "Two years against manufacturing defects." },
      ],
    });
    return "created";
  }

  // Variable: the parent carries the option definitions and a price *range*;
  // the variants carry the real prices and stock the shopper actually buys.
  const prices = spec.variants.map((v) => v.price);
  const product = await Product.create({
    ...base,
    type: "variable",
    price: Math.min(...prices), // the "from" price shown on cards
    compareAtPrice: null,
    stock: 0, // meaningless on a variable parent; availability lives on variants
    sku: null,
    attributes: spec.attributes.map((a) => ({ ...a, variantDefining: true })),
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    faqs: [{ question: "How does it fit?", answer: "True to size. Between sizes? Take the larger." }],
  });

  await Variant.insertMany(
    spec.variants.map((v) => {
      const options = Object.fromEntries(spec.attributes.map((a, i) => [a.name, v.options[i]]));
      return {
        vendor: ctx.vendorId,
        product: product._id,
        options,
        sku: `${slug.toUpperCase().slice(0, 8)}-${v.options.join("-").toUpperCase()}`,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        stock: v.stock,
        // Give colour variants their own image so picking one swaps the gallery.
        image: `https://picsum.photos/seed/${slug}-${slugify(v.options.join("-"))}/900/900`,
        isActive: true,
        createdBy: ctx.ownerId,
      };
    }),
  );

  return "created";
}

async function main() {
  await connectToDatabase();
  console.log("→ Seeding…");
  if (RESET) await reset();

  // --- accounts ---
  const users: Record<keyof typeof ACCOUNTS, Awaited<ReturnType<typeof upsertUser>>> = {} as never;
  for (const [key, spec] of Object.entries(ACCOUNTS)) {
    users[key as keyof typeof ACCOUNTS] = await upsertUser(spec);
  }
  const admin = users.superAdmin;

  let productCount = 0;
  let variantCount = 0;

  for (const v of VENDORS) {
    const owner = users[v.ownerKey];

    let vendor = await Vendor.findOne({ slug: v.slug });
    if (!vendor) {
      vendor = await Vendor.create({
        name: v.name,
        slug: v.slug,
        description: v.description,
        owner: owner._id,
        status: "active",
        createdBy: admin._id,
        logo: `https://picsum.photos/seed/${v.slug}-logo/200/200`,
        banner: `https://picsum.photos/seed/${v.slug}-banner/1600/400`,
        settings: { currency: v.currency, locales: ["en", "ar"], defaultLocale: "en", codEnabled: true },
      });
    }
    const vendorId = vendor._id;

    // The owner is the Vendor Admin; the shared staff roles are attached to the
    // first vendor so support/marketing/driver logins have somewhere to land.
    await Membership.findOneAndUpdate(
      { user: owner._id, vendor: vendorId },
      { $set: { role: ROLES.VENDOR, status: "active", invitedBy: admin._id } },
      { upsert: true },
    );
    if (v.slug === VENDORS[0].slug) {
      for (const [key, role] of [
        ["driver", ROLES.DELIVERY_DRIVER],
        ["support", ROLES.SUPPORT],
        ["marketing", ROLES.MARKETING],
      ] as const) {
        await Membership.findOneAndUpdate(
          { user: users[key]._id, vendor: vendorId },
          { $set: { role, status: "active", invitedBy: admin._id } },
          { upsert: true },
        );
      }
    }

    // --- categories & brands used by this vendor's catalogue ---
    const categorySlugs = [...new Set(v.products.map((p) => p.category))];
    const categories = new Map<string, Types.ObjectId>();
    for (const slug of categorySlugs) {
      const existing =
        (await Category.findOne({ vendor: vendorId, slug })) ??
        (await Category.create({
          vendor: vendorId,
          name: CATEGORY_NAMES[slug] ?? slug,
          slug,
          image: `https://picsum.photos/seed/cat-${slug}/600/450`,
          isActive: true,
          createdBy: owner._id,
        }));
      categories.set(slug, existing._id);
    }

    const brandSlugs = [...new Set(v.products.map((p) => p.brand))];
    const brands = new Map<string, Types.ObjectId>();
    for (const slug of brandSlugs) {
      const existing =
        (await Brand.findOne({ vendor: vendorId, slug })) ??
        (await Brand.create({
          vendor: vendorId,
          name: BRAND_NAMES[slug] ?? slug,
          slug,
          logo: `https://picsum.photos/seed/brand-${slug}/200/200`,
          createdBy: owner._id,
        }));
      brands.set(slug, existing._id);
    }

    // --- coupons ---
    for (const c of v.coupons) {
      await Coupon.findOneAndUpdate(
        { vendor: vendorId, code: c.code },
        {
          $set: {
            ...c,
            vendor: vendorId,
            isActive: true,
            usageLimit: null,
            expiresAt: new Date(Date.now() + 365 * 86400_000),
            createdBy: owner._id,
          },
        },
        { upsert: true },
      );
    }

    // --- products ---
    for (const spec of v.products) {
      const outcome = await seedProduct(spec, { vendorId, ownerId: owner._id, categories, brands });
      if (outcome === "created") {
        productCount++;
        if (spec.kind === "variable") variantCount += spec.variants.length;
      }
    }

    await Vendor.updateOne(
      { _id: vendorId },
      { $set: { "stats.products": await Product.countDocuments({ vendor: vendorId }) } },
    );
  }

  // Catalogue caches would otherwise serve the pre-seed world for a minute.
  const redis = getRedis();
  const stale = await redis.keys("catalog:*");
  const staleLists = await redis.keys("vendor:*:products:*");
  if (stale.length || staleLists.length) await redis.del(...stale, ...staleLists);

  // --- report -------------------------------------------------------------
  const totalProducts = await Product.countDocuments({});
  const totalVariants = await Variant.countDocuments({});

  const line = "─".repeat(64);
  console.log(`\n${line}`);
  console.log("  TEST CREDENTIALS       (password is the same for every account)");
  console.log(line);
  console.log(`  Password: ${PASSWORD}\n`);
  console.log("  Role            Email                          Where to go");
  console.log("  ────────────    ───────────────────────────    ─────────────────");
  console.log(`  Super Admin     ${ACCOUNTS.superAdmin.email.padEnd(29)} /dashboard`);
  console.log(`  Vendor Admin    ${ACCOUNTS.vendorOwner.email.padEnd(29)} /dashboard  (Nova)`);
  console.log(`  Vendor Admin 2  ${ACCOUNTS.vendorOwner2.email.padEnd(29)} /dashboard  (Atlas)`);
  console.log(`  Customer        ${ACCOUNTS.customer.email.padEnd(29)} /account/orders`);
  console.log(`  Delivery        ${ACCOUNTS.driver.email.padEnd(29)} /dashboard/orders`);
  console.log(`  Support         ${ACCOUNTS.support.email.padEnd(29)} /dashboard/orders`);
  console.log(`  Marketing       ${ACCOUNTS.marketing.email.padEnd(29)} /dashboard`);
  console.log(`\n${line}`);
  console.log("  STOREFRONT");
  console.log(line);
  for (const v of VENDORS) console.log(`  ${v.name.padEnd(24)} /v/${v.slug}`);
  console.log(`  Home                     /`);
  console.log(`  All products             /products`);
  console.log(`  Categories               /categories`);
  console.log(`\n  Variable products (variant picker):`);
  console.log(`    /v/nova-electronics/p/terra-running-shoes   (Size × Colour, gaps + OOS)`);
  console.log(`    /v/nova-electronics/p/drift-merino-tee      (Size × Colour)`);
  console.log(`    /v/atlas-home/p/harbor-enamel-mug           (Size × Colour)`);
  console.log(`\n  Coupons: WELCOME10 (10%), SAVE20 (−20 over 100), FREESHIP, ATLAS15 (15%)`);
  console.log(`\n${line}`);
  console.log(
    `  Created this run: ${productCount} products, ${variantCount} variants` +
      `  ·  In database: ${totalProducts} products, ${totalVariants} variants`,
  );
  console.log(`${line}\n`);
  console.log("✓ Seed complete");

  await mongoose.disconnect();
  getRedis().disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
