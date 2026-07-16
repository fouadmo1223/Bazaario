import { connectToDatabase } from "@/server/database/connection";
import { User, Market, Product, Membership, Order, Cart } from "@/server/database/models";
import { marketService } from "@/server/services/market.service";
import { productService } from "@/server/services/product.service";
import { cartService } from "@/server/services/cart.service";
import { checkoutService } from "@/server/services/checkout.service";
import { orderService, canTransition } from "@/server/services/order.service";
import { getRedis } from "@/server/cache/redis";
import { ROLES } from "@/shared/constants/rbac";
import mongoose from "mongoose";

async function main() {
  await connectToDatabase();
  const s = Date.now();
  const admin = await User.create({ name: "R", email: `r_${s}@t.local`, roles: [ROLES.SUPER_ADMIN], status: "active" });
  const owner = await User.create({ name: "O", email: `o_${s}@t.local`, roles: [ROLES.CUSTOMER], status: "active" });
  const buyer = await User.create({ name: "B", email: `b_${s}@t.local`, roles: [ROLES.CUSTOMER], status: "active" });
  const market = await marketService.create({ name: `S${s}`, ownerEmail: owner.email }, String(admin._id));
  const mid = String(market._id);
  const p = await productService.create(mid, { type:"simple", title:"W", description:"", categories:[], tags:[], attributes:[], media:[], price:100, stock:10, trackInventory:true, allowBackorder:false, status:"active", featured:false } as any, String(owner._id));
  await cartService.addItem(mid, { userId: String(buyer._id) }, { productId: String(p._id), quantity: 2 });
  const order = await checkoutService.createOrder(mid, { userId: String(buyer._id) }, { paymentProvider: "cod", address: { recipient:"B", phone:"1", line1:"L", city:"C", country:"EG" } });
  const oid = String(order._id);

  console.log("--- state machine (pure) ---");
  console.log("pending->paid:", canTransition("pending","paid"), "| delivered->pending:", canTransition("delivered","pending"), "| cancelled->paid:", canTransition("cancelled","paid"));

  console.log("--- illegal transition rejected ---");
  let rejected = "";
  try { await orderService.updateStatus(mid, oid, "delivered", String(owner._id)); }
  catch (e) { rejected = (e as Error).message; }
  console.log("pending->delivered blocked:", rejected);

  console.log("--- legal path ---");
  await orderService.updateStatus(mid, oid, "paid", String(owner._id));
  await orderService.updateStatus(mid, oid, "processing", String(owner._id));
  await orderService.updateStatus(mid, oid, "shipped", String(owner._id));
  const delivered = await orderService.updateStatus(mid, oid, "delivered", String(owner._id));
  console.log("status:", delivered.status, "| COD auto-captured:", delivered.payment.status, "| timeline entries:", delivered.timeline.length);

  console.log("--- refunds ---");
  const partial = await orderService.refund(mid, oid, String(owner._id), { amount: 50, reason: "partial" });
  console.log("after 50 of", partial.totals.grandTotal, "-> payment.status:", partial.payment.status);
  let overRefund = "";
  try { await orderService.refund(mid, oid, String(owner._id), { amount: 99999 }); }
  catch (e) { overRefund = (e as Error).message; }
  console.log("over-refund blocked:", overRefund);

  await Promise.all([
    User.deleteMany({ _id: { $in: [admin._id, owner._id, buyer._id] } }).setOptions({ withDeleted: true }),
    Market.deleteMany({ _id: market._id }).setOptions({ withDeleted: true }),
    Product.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Membership.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Order.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
    Cart.deleteMany({ market: market._id }).setOptions({ withDeleted: true }),
  ]);
  await getRedis().del(`market:${mid}:order_seq`);
  await mongoose.disconnect(); getRedis().disconnect();
  console.log("ORDER SMOKE OK"); process.exit(0);
}
main().catch((e) => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
