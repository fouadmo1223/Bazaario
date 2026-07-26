import { describe, it, expect } from "vitest";
import { orderService } from "@/server/services/order.service";
import { checkoutService } from "@/server/services/checkout.service";
import { cartService } from "@/server/services/cart.service";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { makeUser, makeVendor, makeProduct, testAddress } from "./factories";

/**
 * Return requests sit on top of the order, not inside its status machine —
 * approving one is a decision, not a refund. The refund itself still goes
 * through the existing `orderService.refund` (covered in order-refund.test.ts);
 * these tests are about who may ask, when, and who may answer.
 */

async function deliveredOrder(): Promise<{ order: OrderDoc; vendorId: string; customerId: string }> {
  const vendor = await makeVendor();
  const customer = await makeUser();
  const product = await makeProduct(vendor._id, { price: 40, stock: 5 });
  await cartService.addItem(String(vendor._id), { userId: String(customer._id) }, { productId: String(product._id), quantity: 1 });

  const order = await checkoutService.createOrder(
    String(vendor._id),
    { userId: String(customer._id) },
    { paymentProvider: "cod", address: testAddress },
  );

  const vendorId = String(vendor._id);
  const orderId = String(order._id);
  for (const status of ["processing", "shipped", "out_for_delivery", "delivered"] as const) {
    await orderService.updateStatus(vendorId, orderId, status, String(vendor.owner));
  }
  const delivered = await Order.findById(orderId);
  return { order: delivered!, vendorId, customerId: String(customer._id) };
}

describe("return requests", () => {
  it("refuses to request a return before the order is delivered", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const product = await makeProduct(vendor._id);
    await cartService.addItem(String(vendor._id), { userId: String(customer._id) }, { productId: String(product._id), quantity: 1 });
    const order = await checkoutService.createOrder(
      String(vendor._id),
      { userId: String(customer._id) },
      { paymentProvider: "cod", address: testAddress },
    );

    await expect(
      orderService.requestReturn(String(customer._id), String(order._id), { reason: "Changed my mind" }),
    ).rejects.toThrow();
  });

  it("lets the customer request a return once delivered, and refuses a second while one is pending", async () => {
    const { order, customerId } = await deliveredOrder();

    const updated = await orderService.requestReturn(customerId, String(order._id), {
      reason: "Wrong size",
      note: "Ordered a large, got a small",
    });
    expect(updated.returns).toHaveLength(1);
    expect(updated.returns[0]!.status).toBe("requested");
    expect(updated.returns[0]!.reason).toBe("Wrong size");

    await expect(
      orderService.requestReturn(customerId, String(order._id), { reason: "Also this" }),
    ).rejects.toThrow();
  });

  it("refuses to request a return on someone else's order", async () => {
    const { order } = await deliveredOrder();
    const stranger = await makeUser();

    await expect(
      orderService.requestReturn(String(stranger._id), String(order._id), { reason: "Not mine" }),
    ).rejects.toThrow();
  });

  it("lets a vendor approve a pending request, and refuses to resolve it twice", async () => {
    const { order, vendorId, customerId } = await deliveredOrder();
    const admin = await makeUser();

    const withRequest = await orderService.requestReturn(customerId, String(order._id), { reason: "Defective" });
    const returnId = String(withRequest.returns[0]!._id);

    const resolved = await orderService.resolveReturn(
      vendorId,
      String(order._id),
      returnId,
      String(admin._id),
      "approved",
    );
    expect(resolved.returns[0]!.status).toBe("approved");
    expect(resolved.returns[0]!.resolvedAt).not.toBeNull();

    await expect(
      orderService.resolveReturn(vendorId, String(order._id), returnId, String(admin._id), "rejected"),
    ).rejects.toThrow();
  });

  it("lets a vendor reject a request with a note the customer can see", async () => {
    const { order, vendorId, customerId } = await deliveredOrder();
    const admin = await makeUser();

    const withRequest = await orderService.requestReturn(customerId, String(order._id), { reason: "Don't like it" });
    const returnId = String(withRequest.returns[0]!._id);

    const resolved = await orderService.resolveReturn(
      vendorId,
      String(order._id),
      returnId,
      String(admin._id),
      "rejected",
      "Outside the 30-day window",
    );
    expect(resolved.returns[0]!.status).toBe("rejected");
    expect(resolved.returns[0]!.resolutionNote).toBe("Outside the 30-day window");
  });

  it("refuses to resolve a return request scoped to another vendor's order", async () => {
    const { order, customerId } = await deliveredOrder();
    const otherVendor = await makeVendor();
    const admin = await makeUser();

    const withRequest = await orderService.requestReturn(customerId, String(order._id), { reason: "Wrong item" });
    const returnId = String(withRequest.returns[0]!._id);

    await expect(
      orderService.resolveReturn(String(otherVendor._id), String(order._id), returnId, String(admin._id), "approved"),
    ).rejects.toThrow();
  });
});
