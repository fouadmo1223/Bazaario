import { describe, it, expect } from "vitest";
import { checkoutService } from "@/server/services/checkout.service";
import { cartService } from "@/server/services/cart.service";
import { orderService } from "@/server/services/order.service";
import { listVendorDrivers, listDriverOrders, getVendorOrder } from "@/features/orders/queries";
import { ROLES } from "@/shared/constants/rbac";
import { makeUser, makeVendor, makeProduct, makeMembership, testAddress } from "./factories";

/**
 * The driver-facing UI leans on three things this file pins: the
 * driver-assignment dropdown only offers staff who actually hold the
 * delivery-driver role, `listDriverOrders` (a wrapper around
 * `orderService.listForDriver`, which existed unused before this feature)
 * scopes correctly to one driver and drops off delivered orders, and the
 * order detail view exposes the assigned driver's id so the delivery page
 * can check "is this mine" before rendering.
 */

async function shippedOrder(vendorId: string, customerId: string, actorId: string): Promise<string> {
  const product = await makeProduct(vendorId, { price: 30, stock: 5 });
  await cartService.addItem(vendorId, { userId: customerId }, { productId: String(product._id), quantity: 1 });
  const order = await checkoutService.createOrder(
    vendorId,
    { userId: customerId },
    { paymentProvider: "cod", address: testAddress },
  );
  const orderId = String(order._id);
  await orderService.updateStatus(vendorId, orderId, "processing", actorId);
  await orderService.updateStatus(vendorId, orderId, "shipped", actorId);
  return orderId;
}

describe("listVendorDrivers", () => {
  it("lists only staff holding the delivery-driver role", async () => {
    const vendor = await makeVendor();
    const driver = await makeUser();
    const support = await makeUser();
    await makeMembership(driver._id, vendor._id, ROLES.DELIVERY_DRIVER);
    await makeMembership(support._id, vendor._id, ROLES.SUPPORT);

    const drivers = await listVendorDrivers(String(vendor._id));

    expect(drivers).toHaveLength(1);
    expect(drivers[0]!.userId).toBe(String(driver._id));
  });

  it("skips a suspended driver membership", async () => {
    const vendor = await makeVendor();
    const driver = await makeUser();
    await makeMembership(driver._id, vendor._id, ROLES.DELIVERY_DRIVER, { status: "suspended" });

    expect(await listVendorDrivers(String(vendor._id))).toHaveLength(0);
  });
});

describe("listDriverOrders", () => {
  it("shows a driver only the orders assigned to them, and drops off once delivered", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const driver = await makeUser();
    const otherDriver = await makeUser();
    await makeMembership(driver._id, vendor._id, ROLES.DELIVERY_DRIVER);
    await makeMembership(otherDriver._id, vendor._id, ROLES.DELIVERY_DRIVER);

    const vendorId = String(vendor._id);
    const actorId = String(vendor.owner);
    const orderId = await shippedOrder(vendorId, String(customer._id), actorId);
    await orderService.assignDriver(vendorId, orderId, String(driver._id), actorId);

    const mine = await listDriverOrders(vendorId, String(driver._id), {});
    expect(mine.items.map((o) => o.id)).toEqual([orderId]);

    const someoneElses = await listDriverOrders(vendorId, String(otherDriver._id), {});
    expect(someoneElses.items).toHaveLength(0);

    await orderService.updateStatus(vendorId, orderId, "delivered", actorId);
    const afterDelivery = await listDriverOrders(vendorId, String(driver._id), {});
    expect(afterDelivery.items).toHaveLength(0);
  });
});

describe("order detail driver id", () => {
  it("is null until assigned, then reflects the assigned driver", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const driver = await makeUser();
    await makeMembership(driver._id, vendor._id, ROLES.DELIVERY_DRIVER);

    const vendorId = String(vendor._id);
    const actorId = String(vendor.owner);
    const product = await makeProduct(vendor._id);
    await cartService.addItem(vendorId, { userId: String(customer._id) }, { productId: String(product._id), quantity: 1 });
    const order = await checkoutService.createOrder(
      vendorId,
      { userId: String(customer._id) },
      { paymentProvider: "cod", address: testAddress },
    );
    const orderId = String(order._id);

    expect((await getVendorOrder(vendorId, orderId)).shipping.driverId).toBeNull();

    await orderService.assignDriver(vendorId, orderId, String(driver._id), actorId);

    expect((await getVendorOrder(vendorId, orderId)).shipping.driverId).toBe(String(driver._id));
  });
});
