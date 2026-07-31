import { describe, it, expect } from "vitest";
import { walletService } from "@/server/services/wallet.service";
import { checkoutService } from "@/server/services/checkout.service";
import { cartService } from "@/server/services/cart.service";
import { Order } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { Wallet, WalletTxn } from "@/server/database/models/wallet.model";
import { makeUser, makeVendor, makeProduct, testAddress } from "./factories";

describe("wallet ledger", () => {
  it("credits and debits move the balance and leave a ledger entry", async () => {
    const user = await makeUser();

    await walletService.credit(String(user._id), 50, "Goodwill credit", null);
    expect(await walletService.getBalance(String(user._id))).toBe(50);

    await walletService.debit(String(user._id), 20, "Test spend");
    expect(await walletService.getBalance(String(user._id))).toBe(30);

    const history = await walletService.history(String(user._id));
    expect(history).toHaveLength(2);
    expect(history.map((t) => t.type)).toEqual(["debit", "credit"]); // newest first
  });

  it("refuses to debit past the balance, and leaves it untouched", async () => {
    const user = await makeUser();
    await walletService.credit(String(user._id), 10, "Starter credit", null);

    await expect(walletService.debit(String(user._id), 10.01, "Too much")).rejects.toThrow();
    expect(await walletService.getBalance(String(user._id))).toBe(10);
  });

  it("starts every user at a balance of zero, not an error", async () => {
    const user = await makeUser();
    expect(await walletService.getBalance(String(user._id))).toBe(0);
  });

  /**
   * The one that matters, mirroring the stock-oversell race in
   * checkout-oversell.test.ts: ten concurrent debits for the whole balance,
   * exactly one may win, and the balance must never go negative.
   */
  it("lets exactly one of ten simultaneous debits for the whole balance win", async () => {
    const user = await makeUser();
    await walletService.credit(String(user._id), 10, "Starter credit", null);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => walletService.debit(String(user._id), 10, "Race")),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    expect(await walletService.getBalance(String(user._id))).toBe(0);

    const wallet = await Wallet.findOne({ user: user._id });
    expect(wallet!.balance).toBeGreaterThanOrEqual(0);
  });
});

describe("wallet at checkout", () => {
  async function walletOrder(balance: number, price: number) {
    const vendor = await makeVendor();
    const customer = await makeUser();
    await walletService.credit(String(customer._id), balance, "Starter credit", null);
    const product = await makeProduct(vendor._id, { price, stock: 5 });
    await cartService.addItem(String(vendor._id), { userId: String(customer._id) }, { productId: String(product._id), quantity: 1 });
    return { vendor, customer, product };
  }

  it("captures the order immediately and debits the wallet for the exact total", async () => {
    const { vendor, customer } = await walletOrder(500, 40);

    const order = await checkoutService.createOrder(
      String(vendor._id),
      { userId: String(customer._id) },
      { paymentProvider: "wallet", address: testAddress },
    );

    expect(order.status).toBe("paid");
    expect(order.payment.status).toBe("paid");
    expect(order.payment.paidAt).not.toBeNull();

    const balance = await walletService.getBalance(String(customer._id));
    expect(balance).toBe(500 - order.totals.grandTotal);

    const ledger = await WalletTxn.findOne({ user: customer._id, type: "debit" });
    expect(ledger!.reference).toBe(order.number);
  });

  it("refuses the order on insufficient balance and releases the stock it had claimed", async () => {
    const { vendor, customer, product } = await walletOrder(1, 40);

    await expect(
      checkoutService.createOrder(
        String(vendor._id),
        { userId: String(customer._id) },
        { paymentProvider: "wallet", address: testAddress },
      ),
    ).rejects.toThrow();

    expect(await Order.countDocuments({})).toBe(0);
    expect(await walletService.getBalance(String(customer._id))).toBe(1);
    expect((await Product.findById(product._id))!.stock).toBe(5);
  });

  it("refuses a guest checkout paying from a wallet", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct(vendor._id, { price: 10, stock: 5 });
    await cartService.addItem(String(vendor._id), { guestToken: "guest-wallet-test" }, {
      productId: String(product._id),
      quantity: 1,
    });

    await expect(
      checkoutService.createOrder(
        String(vendor._id),
        { guestToken: "guest-wallet-test" },
        { paymentProvider: "wallet", address: testAddress, guestEmail: "guest@example.com" },
      ),
    ).rejects.toThrow();
  });
});
