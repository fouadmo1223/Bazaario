/**
 * Development seed. Idempotent — safe to run repeatedly.
 * Usage: `npm run seed`
 *
 * Creates a super admin, a market with its single Market Admin, brands,
 * categories, and demo products so the storefront and dashboard have data.
 */
import { connectToDatabase } from "./connection";
import { User, Market, Membership, Brand, Category, Product } from "./models";
import { hashPassword } from "@/server/security/password";
import { ROLES } from "@/shared/constants/rbac";
import { getRedis } from "@/server/cache/redis";
import mongoose from "mongoose";

const SUPER_ADMIN = { email: "admin@commerce.local", password: "Admin123!", name: "Super Admin" };
const MARKET_ADMIN = { email: "owner@commerce.local", password: "Owner123!", name: "Market Owner" };
const MARKET_SLUG = "demo-store";

const DEMO_PRODUCTS = [
  { title: "Aurora Wireless Headphones", price: 129.99, compareAtPrice: 179.99, stock: 24, tags: ["audio", "wireless"], featured: true,
    description: "Immersive sound with active noise cancellation and 30-hour battery life." },
  { title: "Terra Running Shoes", price: 89.5, compareAtPrice: null, stock: 40, tags: ["footwear"], featured: true,
    description: "Lightweight trail runners with responsive cushioning." },
  { title: "Nimbus Laptop Sleeve", price: 34.0, compareAtPrice: 45.0, stock: 60, tags: ["accessories"], featured: false,
    description: "Water-resistant 14-inch sleeve with a felt interior." },
  { title: "Solstice Desk Lamp", price: 59.0, compareAtPrice: null, stock: 3, tags: ["home"], featured: false,
    description: "Adjustable warm-to-cool LED lamp with touch dimming." },
  { title: "Vertex Mechanical Keyboard", price: 149.0, compareAtPrice: 199.0, stock: 0, tags: ["computing"], featured: true,
    description: "Hot-swappable switches, aluminium body, per-key RGB." },
  { title: "Cobalt Water Bottle", price: 24.99, compareAtPrice: null, stock: 120, tags: ["outdoors"], featured: false,
    description: "Vacuum-insulated 750ml bottle; keeps drinks cold for 24 hours." },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function upsertUser(spec: { email: string; password: string; name: string }, roles: string[]) {
  const existing = await User.findOne({ email: spec.email });
  if (existing) return existing;
  return User.create({
    email: spec.email,
    name: spec.name,
    passwordHash: await hashPassword(spec.password),
    roles,
    status: "active",
    emailVerifiedAt: new Date(),
  });
}

async function main() {
  await connectToDatabase();
  console.log("→ Seeding…");

  const admin = await upsertUser(SUPER_ADMIN, [ROLES.SUPER_ADMIN]);
  const owner = await upsertUser(MARKET_ADMIN, [ROLES.CUSTOMER, ROLES.MARKET_ADMIN]);

  let market = await Market.findOne({ slug: MARKET_SLUG });
  if (!market) {
    market = await Market.create({
      name: "Demo Store",
      slug: MARKET_SLUG,
      description: "A demo market showcasing the platform.",
      owner: owner._id,
      status: "active",
      createdBy: admin._id,
      settings: { currency: "USD", locales: ["en", "ar"], defaultLocale: "en" },
    });
  }
  const marketId = market._id;

  await Membership.findOneAndUpdate(
    { user: owner._id, market: marketId },
    { $set: { role: ROLES.MARKET_ADMIN, status: "active", invitedBy: admin._id } },
    { upsert: true },
  );

  const brand =
    (await Brand.findOne({ market: marketId, slug: "acme" })) ??
    (await Brand.create({ market: marketId, name: "Acme", slug: "acme", createdBy: owner._id }));

  const category =
    (await Category.findOne({ market: marketId, slug: "featured" })) ??
    (await Category.create({ market: marketId, name: "Featured", slug: "featured", createdBy: owner._id }));

  let created = 0;
  for (const spec of DEMO_PRODUCTS) {
    const slug = slugify(spec.title);
    const exists = await Product.findOne({ market: marketId, slug });
    if (exists) continue;

    await Product.create({
      market: marketId,
      type: "simple",
      title: spec.title,
      slug,
      description: spec.description,
      shortDescription: spec.description,
      brand: brand._id,
      categories: [category._id],
      tags: spec.tags,
      price: spec.price,
      compareAtPrice: spec.compareAtPrice,
      stock: spec.stock,
      trackInventory: true,
      status: "active",
      featured: spec.featured,
      publishedAt: new Date(),
      sku: slug.toUpperCase().slice(0, 12),
      createdBy: owner._id,
      media: [
        {
          // Deterministic placeholder imagery keyed off the slug.
          url: `https://picsum.photos/seed/${slug}/800/800`,
          type: "image",
          alt: spec.title,
          width: 800,
          height: 800,
        },
      ],
    });
    created++;
  }

  await Market.updateOne({ _id: marketId }, { $set: { "stats.products": await Product.countDocuments({ market: marketId }) } });

  console.log(`✓ Super admin:  ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
  console.log(`✓ Market admin: ${MARKET_ADMIN.email} / ${MARKET_ADMIN.password}`);
  console.log(`✓ Market:       ${market.name}  →  /m/${MARKET_SLUG}`);
  console.log(`✓ Products:     ${created} created (${await Product.countDocuments({ market: marketId })} total)`);
  console.log("✓ Seed complete");

  await mongoose.disconnect();
  getRedis().disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
