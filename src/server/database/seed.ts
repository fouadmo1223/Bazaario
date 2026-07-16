/**
 * Development seed. Idempotent — safe to run repeatedly.
 * Usage: `npm run seed`
 *
 * Creates a super admin, a vendor with its single Vendor Admin, brands,
 * categories, and demo products so the storefront and dashboard have data.
 */
import { connectToDatabase } from "./connection";
import { User, Vendor, Membership, Brand, Category, Product } from "./models";
import { hashPassword } from "@/server/security/password";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { getRedis } from "@/server/cache/redis";
import mongoose from "mongoose";

const SUPER_ADMIN = { email: "admin@commerce.local", password: "Admin123!", name: "Super Admin" };
const VENDOR = { email: "owner@commerce.local", password: "Owner123!", name: "Vendor Owner" };
const VENDOR_SLUG = "demo-store";

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

async function upsertUser(spec: { email: string; password: string; name: string }, roles: Role[]) {
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
  const owner = await upsertUser(VENDOR, [ROLES.CUSTOMER, ROLES.VENDOR]);

  let vendor = await Vendor.findOne({ slug: VENDOR_SLUG });
  if (!vendor) {
    vendor = await Vendor.create({
      name: "Demo Store",
      slug: VENDOR_SLUG,
      description: "A demo vendor showcasing the platform.",
      owner: owner._id,
      status: "active",
      createdBy: admin._id,
      settings: { currency: "USD", locales: ["en", "ar"], defaultLocale: "en" },
    });
  }
  const vendorId = vendor._id;

  await Membership.findOneAndUpdate(
    { user: owner._id, vendor: vendorId },
    { $set: { role: ROLES.VENDOR, status: "active", invitedBy: admin._id } },
    { upsert: true },
  );

  const brand =
    (await Brand.findOne({ vendor: vendorId, slug: "acme" })) ??
    (await Brand.create({ vendor: vendorId, name: "Acme", slug: "acme", createdBy: owner._id }));

  const category =
    (await Category.findOne({ vendor: vendorId, slug: "featured" })) ??
    (await Category.create({ vendor: vendorId, name: "Featured", slug: "featured", createdBy: owner._id }));

  let created = 0;
  for (const spec of DEMO_PRODUCTS) {
    const slug = slugify(spec.title);
    const exists = await Product.findOne({ vendor: vendorId, slug });
    if (exists) continue;

    await Product.create({
      vendor: vendorId,
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

  await Vendor.updateOne({ _id: vendorId }, { $set: { "stats.products": await Product.countDocuments({ vendor: vendorId }) } });

  console.log(`✓ Super admin:  ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
  console.log(`✓ Vendor admin: ${VENDOR.email} / ${VENDOR.password}`);
  console.log(`✓ Vendor:       ${vendor.name}  →  /v/${VENDOR_SLUG}`);
  console.log(`✓ Products:     ${created} created (${await Product.countDocuments({ vendor: vendorId })} total)`);
  console.log("✓ Seed complete");

  await mongoose.disconnect();
  getRedis().disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
