import { connectToDatabase } from "@/server/database/connection";
import { User, Market, Product, Membership, Brand } from "@/server/database/models";
import { marketService } from "@/server/services/market.service";
import { productService } from "@/server/services/product.service";
import { ROLES } from "@/shared/constants/rbac";
import mongoose from "mongoose";

async function main() {
  console.log("connecting...");
  await connectToDatabase();
  console.log("connected");
  const stamp = Date.now();
  const admin = await User.create({ name: "Root", email: `root_${stamp}@t.local`, roles: [ROLES.SUPER_ADMIN], status: "active" });
  const owner = await User.create({ name: "Owner", email: `owner_${stamp}@t.local`, roles: [ROLES.CUSTOMER], status: "active" });
  const market = await marketService.create({ name: `Shop ${stamp}`, ownerEmail: owner.email, currency: "USD" }, String(admin._id));
  console.log("market created", market.slug);
  const brand = await Brand.create({ market: market._id, name: "Acme", slug: "acme" });
  const product = await productService.create(String(market._id), {
    type: "simple", title: "Test Sneaker", description: "Nice", brand: String(brand._id), categories: [], tags: ["shoes"],
    attributes: [], media: [], price: 89.99, compareAtPrice: 120, stock: 10,
    trackInventory: true, allowBackorder: false, status: "active", featured: true,
  } as any, String(owner._id));
  console.log("product created", product.slug);
  const list = await productService.list(String(market._id), { status: "active" } as any, { page: 1, limit: 10, order: "desc" } as any);
  const populated = list.items[0] as any;
  console.log("LIST total:", list.total, "| brand populated:", populated?.brand?.name);
  await Promise.all([
    User.deleteMany({ _id: { $in: [admin._id, owner._id] } }).setOptions({ withDeleted: true }),
    Market.deleteMany({ _id: market._id }).setOptions({ withDeleted: true }),
    Product.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Membership.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Brand.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
  ]);
  await mongoose.disconnect();
  console.log("CATALOG SMOKE OK");
}
main().catch((e) => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
