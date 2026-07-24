import { describe, it, expect } from "vitest";
import { productService } from "@/server/services/product.service";
import { Product } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { makeUser, makeVendor, makeProduct } from "./factories";
import type { VariantInput } from "@/features/products/schemas";

/**
 * The variant matrix.
 *
 * `syncVariants` is a replace, not a merge: the editor sends the whole grid
 * every save, so the stored set must end up exactly what was sent. The part
 * worth guarding hardest is the pricing rule — the denormalized `priceRange`
 * and `from` price come from **active** variants only, because an inactive
 * combination is not purchasable and pricing a listing off it advertises a
 * number that leads nowhere. That is a decision, not a detail, and nothing
 * about the code would look wrong if it silently changed.
 *
 * Note these call the service directly, so `isActive` is passed explicitly:
 * the `true` default lives in the zod schema the action parses with, not in the
 * service, which trusts what it is handed.
 */

const variant = (sku: string, price: number, isActive: boolean, options: Record<string, string>): VariantInput => ({
  options,
  sku,
  price,
  stock: 5,
  isActive,
});

async function variableProduct() {
  const owner = await makeUser();
  const vendor = await makeVendor();
  const product = await makeProduct(vendor._id, { type: "variable" });
  return {
    vendorId: String(vendor._id),
    productId: String(product._id),
    actorId: String(owner._id),
  };
}

const SIZE = { name: "Size", values: ["S", "M"], variantDefining: true };

describe("syncVariants", () => {
  it("stores the grid and the options that name it", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      {
        attributes: [SIZE],
        variants: [variant("TEE-S", 20, true, { Size: "S" }), variant("TEE-M", 25, true, { Size: "M" })],
      },
      actorId,
    );

    const stored = await Variant.find({ product: productId }).sort({ sku: 1 });
    expect(stored.map((v) => v.sku)).toEqual(["TEE-M", "TEE-S"]);

    const product = await Product.findById(productId);
    expect(product!.attributes.map((a) => a.name)).toEqual(["Size"]);
    expect([...product!.attributes[0]!.values]).toEqual(["S", "M"]);
  });

  /** The rule the whole feature hangs on. */
  it("prices from active variants only", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      {
        attributes: [SIZE],
        variants: [
          variant("A", 50, true, { Size: "S" }),
          variant("B", 80, true, { Size: "M" }),
          // Cheapest, but switched off — it must not set the "from" price.
          variant("C", 20, false, { Size: "L" }),
        ],
      },
      actorId,
    );

    const product = await Product.findById(productId);
    expect(product!.priceRange!.min).toBe(50);
    expect(product!.priceRange!.max).toBe(80);
    expect(product!.price).toBe(50);
  });

  it("clears the range when every variant is inactive", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      { attributes: [SIZE], variants: [variant("A", 50, false, { Size: "S" })] },
      actorId,
    );

    const product = await Product.findById(productId);
    expect(product!.priceRange!.min).toBeNull();
    expect(product!.priceRange!.max).toBeNull();
  });

  /**
   * A replace, not a merge — the editor can only remove a combination by not
   * sending it, so a leftover row would resurrect a variant the vendor deleted.
   */
  it("replaces the previous grid rather than adding to it", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      { attributes: [SIZE], variants: [variant("OLD-1", 10, true, { Size: "S" })] },
      actorId,
    );
    await productService.syncVariants(
      vendorId,
      productId,
      { attributes: [SIZE], variants: [variant("NEW-1", 30, true, { Size: "M" })] },
      actorId,
    );

    const stored = await Variant.find({ product: productId });
    expect(stored.map((v) => v.sku)).toEqual(["NEW-1"]);
  });

  it("emptying the grid removes every variant and the range", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      { attributes: [SIZE], variants: [variant("A", 50, true, { Size: "S" })] },
      actorId,
    );
    await productService.syncVariants(vendorId, productId, { attributes: [], variants: [] }, actorId);

    expect(await Variant.countDocuments({ product: productId })).toBe(0);
    const product = await Product.findById(productId);
    expect(product!.priceRange!.min).toBeNull();
  });

  it("refuses a simple product", async () => {
    const owner = await makeUser();
    const vendor = await makeVendor();
    const simple = await makeProduct(vendor._id); // defaults to simple

    await expect(
      productService.syncVariants(
        String(vendor._id),
        String(simple._id),
        { attributes: [SIZE], variants: [variant("A", 10, true, { Size: "S" })] },
        String(owner._id),
      ),
    ).rejects.toThrow();
  });

  /** Tenant isolation: another vendor's id must not reach this product. */
  it("refuses a product belonging to a different vendor", async () => {
    const { productId, actorId } = await variableProduct();
    const otherVendor = await makeVendor();

    await expect(
      productService.syncVariants(
        String(otherVendor._id),
        productId,
        { attributes: [SIZE], variants: [variant("A", 10, true, { Size: "S" })] },
        actorId,
      ),
    ).rejects.toThrow();

    expect(await Variant.countDocuments({ product: productId })).toBe(0);
  });
});

/**
 * The editor and the storefront deliberately disagree about inactive variants:
 * a shopper must not be offered a combination the cart would reject, while the
 * vendor has to see it to switch it back on.
 */
describe("variant listings", () => {
  it("hides inactive variants from the storefront but shows them to the editor", async () => {
    const { vendorId, productId, actorId } = await variableProduct();

    await productService.syncVariants(
      vendorId,
      productId,
      {
        attributes: [SIZE],
        variants: [variant("LIVE", 40, true, { Size: "S" }), variant("OFF", 45, false, { Size: "M" })],
      },
      actorId,
    );

    const storefront = await productService.listVariants(vendorId, productId);
    expect(storefront.map((v) => v.sku)).toEqual(["LIVE"]);

    const editor = await productService.listAllVariants(vendorId, productId);
    expect(editor.map((v) => v.sku).sort()).toEqual(["LIVE", "OFF"]);
  });
});
