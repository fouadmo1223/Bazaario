import { describe, it, expect } from "vitest";
import { orderService } from "@/server/services/order.service";
import { checkoutService } from "@/server/services/checkout.service";
import { cartService } from "@/server/services/cart.service";
import { Product } from "@/server/database/models/product.model";
import { Cart } from "@/server/database/models/cart.model";
import { makeUser, makeVendor, makeProduct, testAddress } from "./factories";

/**
 * "Buy again" re-adds a past order's lines to the cart. It has to be
 * best-effort, not all-or-nothing: an order can outlive the products in it —
 * discontinued, deactivated, or sold out — and none of that should block the
 * lines that are still buyable, nor silently drop them without saying so.
 */

async function orderFor(
  customerId: string,
  vendorId: string,
  lines: { product: { _id: unknown }; quantity: number }[],
) {
  for (const line of lines) {
    await cartService.addItem(
      vendorId,
      { userId: customerId },
      { productId: String(line.product._id), quantity: line.quantity },
    );
  }
  return checkoutService.createOrder(
    vendorId,
    { userId: customerId },
    { paymentProvider: "cod", address: testAddress },
  );
}

describe("reorder", () => {
  it("re-adds what is still available and reports what is not", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const keep = await makeProduct(vendor._id, { price: 20, stock: 5 });
    const gone = await makeProduct(vendor._id, { price: 15, stock: 5 });

    const order = await orderFor(String(customer._id), String(vendor._id), [
      { product: keep, quantity: 2 },
      { product: gone, quantity: 1 },
    ]);

    // Discontinued after the order shipped.
    await Product.updateOne({ _id: gone._id }, { $set: { status: "archived" } });

    const result = await orderService.reorder(String(customer._id), String(order._id));

    expect(result.added).toBe(1);
    expect(result.skipped).toEqual([{ title: gone.title, reason: expect.any(String) }]);
    expect(result.vendorSlug).toBe(vendor.slug);

    const cart = await Cart.findOne({ vendor: vendor._id, user: customer._id });
    const line = cart!.items.find((i) => String(i.product) === String(keep._id));
    expect(line?.quantity).toBe(2);
    expect(cart!.items).toHaveLength(1);
  });

  it("refuses to reorder someone else's order", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const stranger = await makeUser();
    const product = await makeProduct(vendor._id);

    const order = await orderFor(String(customer._id), String(vendor._id), [
      { product, quantity: 1 },
    ]);

    await expect(orderService.reorder(String(stranger._id), String(order._id))).rejects.toThrow();

    // Refused, not silently dropped: the stranger's own cart stays untouched.
    const strangerCart = await Cart.findOne({ vendor: vendor._id, user: stranger._id });
    expect(strangerCart).toBeNull();
  });

  it("adds nothing and reports every line when the whole order is gone", async () => {
    const vendor = await makeVendor();
    const customer = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 1 });

    const order = await orderFor(String(customer._id), String(vendor._id), [
      { product, quantity: 1 },
    ]);

    await Product.deleteOne({ _id: product._id });

    const result = await orderService.reorder(String(customer._id), String(order._id));

    expect(result.added).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });
});
