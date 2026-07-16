import { connectToDatabase } from "@/server/database/connection";
import { User, Market, Product, Membership, Coupon, Order, Cart } from "@/server/database/models";
import { marketService } from "@/server/services/market.service";
import { productService } from "@/server/services/product.service";
import { cartService } from "@/server/services/cart.service";
import { checkoutService } from "@/server/services/checkout.service";
import { getRedis } from "@/server/cache/redis";
import { ROLES } from "@/shared/constants/rbac";
import mongoose from "mongoose";

async function main() {
  await connectToDatabase();
  const stamp = Date.now();
  const admin = await User.create({ name: "Root", email: `root_${stamp}@t.local`, roles: [ROLES.SUPER_ADMIN], status: "active" });
  const owner = await User.create({ name: "Owner", email: `owner_${stamp}@t.local`, roles: [ROLES.CUSTOMER], status: "active" });
  const buyer = await User.create({ name: "Buyer", email: `buyer_${stamp}@t.local`, roles: [ROLES.CUSTOMER], status: "active" });
  const market = await marketService.create({ name: `Shop ${stamp}`, ownerEmail: owner.email, currency: "USD" }, String(admin._id));
  const mid = String(market._id);
  const product = await productService.create(mid, {
    type: "simple", title: "Widget", description: "x", categories: [], tags: [], attributes: [], media: [],
    price: 100, stock: 5, trackInventory: true, allowBackorder: false, status: "active", featured: false,
  } as any, String(owner._id));
  await Coupon.create({ market: market._id, code: "SAVE10", type: "percentage", value: 10, isActive: true, minSpend: 0 });
  await cartService.addItem(mid, { userId: String(buyer._id) }, { productId: String(product._id), quantity: 2 });
  const cart = await cartService.getOrCreate(mid, { userId: String(buyer._id) });
  cart.coupon = "SAVE10"; await cart.save();
  console.log("CART subtotal:", cart.get("subtotal"), "| itemCount:", cart.get("itemCount"));
  const order = await checkoutService.createOrder(mid, { userId: String(buyer._id) }, {
    paymentProvider: "cod", shippingBase: 20,
    address: { recipient: "Buyer", phone: "123", line1: "St 1", city: "Cairo", country: "EG" },
  });
  console.log("ORDER", order.number, "status:", order.status, "sub:", order.totals.subtotal, "disc:", order.totals.discount, "tax:", order.totals.tax, "ship:", order.totals.shipping, "grand:", order.totals.grandTotal);
  const freshProduct = await Product.findById(product._id);
  console.log("STOCK now:", freshProduct?.stock, "(was 5, ordered 2)");
  const freshCoupon = await Coupon.findOne({ market: market._id, code: "SAVE10" });
  console.log("COUPON usedCount:", freshCoupon?.usedCount);
  await cartService.addItem(mid, { userId: String(buyer._id) }, { productId: String(product._id), quantity: 1 });
  const order2 = await checkoutService.createOrder(mid, { userId: String(buyer._id) }, {
    paymentProvider: "cod", address: { recipient: "B", phone: "1", line1: "L", city: "C", country: "EG" } });
  console.log("ORDER2 number:", order2.number, "(expected", Number(order.number)+1, ")");
  await Promise.all([
    User.deleteMany({ _id: { $in: [admin._id, owner._id, buyer._id] } }).setOptions({ withDeleted: true }),
    Market.deleteMany({ _id: market._id }).setOptions({ withDeleted: true }),
    Product.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Membership.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Coupon.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Order.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Cart.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
  ]);
  await getRedis().del(`market:${mid}:order_seq`);
  await mongoose.disconnect(); getRedis().disconnect();
  console.log("CHECKOUT SMOKE OK"); process.exit(0);
}
main().catch((e) => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
