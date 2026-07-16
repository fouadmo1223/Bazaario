import { connectToDatabase } from "@/server/database/connection";
import { productRepository, type ProductFilters } from "@/server/repositories/product.repository";
import { Product, type ProductDoc } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import { paginationSchema, type PaginationInput, type Paginated } from "@/shared/lib/pagination";
import { cached, getRedis } from "@/server/cache/redis";
import { storefrontFilterSchema } from "@/features/products/schemas";
import type {
  CreateProductInput,
  UpdateProductInput,
  VariantInput,
  ProductQueryInput,
} from "@/features/products/schemas";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);

async function uniqueSlug(vendor: string, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Bounded loop; collisions are rare within a single vendor.
  while (true) {
    const existing = await productRepository.findBySlug(vendor, slug);
    if (!existing || String(existing._id) === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

const listCacheKey = (vendor: string, q: unknown, p: unknown) =>
  `vendor:${vendor}:products:${JSON.stringify(q)}:${JSON.stringify(p)}`;

async function invalidateVendorProducts(vendor: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`vendor:${vendor}:products:*`);
  if (keys.length) await redis.del(...keys);
}

/**
 * Product domain service. All operations are vendor-scoped — the caller must
 * have already passed `requireVendorPermission(vendorId, PRODUCT_WRITE)`.
 */
export const productService = {
  async create(vendorId: string, input: CreateProductInput, actorId: string): Promise<ProductDoc> {
    await connectToDatabase();
    const base = slugify(input.slug ?? input.title);
    const slug = await uniqueSlug(vendorId, base);

    const product = await Product.create({
      ...input,
      vendor: vendorId,
      slug,
      createdBy: actorId,
      publishedAt: input.status === "active" ? new Date() : null,
    });

    await Vendor.updateOne({ _id: vendorId }, { $inc: { "stats.products": 1 } });
    await invalidateVendorProducts(vendorId);
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "product.create",
      entity: "Product", entityId: String(product._id), diff: { title: product.title },
    });
    return product;
  },

  async update(
    vendorId: string,
    productId: string,
    input: UpdateProductInput,
    actorId: string,
  ): Promise<ProductDoc> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    if (!product) throw Errors.notFound("Product not found");

    if (input.slug && input.slug !== product.slug) {
      input.slug = await uniqueSlug(vendorId, slugify(input.slug), productId);
    }
    Object.assign(product, input, { updatedBy: actorId });
    if (input.status === "active" && !product.publishedAt) product.publishedAt = new Date();
    await product.save();

    await invalidateVendorProducts(vendorId);
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "product.update",
      entity: "Product", entityId: productId,
    });
    return product;
  },

  async remove(vendorId: string, productId: string, actorId: string): Promise<void> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    if (!product) throw Errors.notFound("Product not found");
    await productRepository.softDeleteById(productId, actorId);
    await Variant.updateMany({ product: productId }, { $set: { deletedAt: new Date() } });
    await Vendor.updateOne({ _id: vendorId }, { $inc: { "stats.products": -1 } });
    await invalidateVendorProducts(vendorId);
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "product.delete",
      entity: "Product", entityId: productId,
    });
  },

  /** Replace a variable product's variants and refresh its denormalized price range. */
  async syncVariants(
    vendorId: string,
    productId: string,
    variants: VariantInput[],
    actorId: string,
  ): Promise<void> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    if (!product) throw Errors.notFound("Product not found");
    if (product.type !== "variable") throw Errors.badRequest("Product is not variable");

    await Variant.deleteMany({ product: productId });
    if (variants.length) {
      await Variant.insertMany(
        variants.map((v) => ({ ...v, vendor: vendorId, product: productId, createdBy: actorId })),
      );
      const prices = variants.map((v) => v.price);
      product.priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
      product.price = Math.min(...prices);
    } else {
      product.priceRange = { min: null, max: null };
    }
    await product.save();
    await invalidateVendorProducts(vendorId);
  },

  async list(vendorId: string, query: ProductQueryInput, pagination: PaginationInput): Promise<Paginated<ProductDoc>> {
    await connectToDatabase();
    const filters: ProductFilters = { vendor: vendorId, ...query };
    return productRepository.search(filters, pagination);
  },

  /** Storefront read — active products only, cached in Redis. */
  /**
   * Public storefront listing.
   *
   * `vendor` and `status` are pinned *after* the caller's filters are spread in.
   * Spreading last would let a caller pass `status: "draft"` and read unpublished
   * products, or a different `vendor` and cross the tenant boundary — the
   * storefront only ever shows this vendor's active catalogue.
   */
  async listStorefront(vendorId: string, query: unknown): Promise<Paginated<ProductDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const filters = storefrontFilterSchema.parse(query ?? {});
    return cached(listCacheKey(vendorId, filters, pagination), 60, () =>
      productRepository.search({ ...filters, vendor: vendorId, status: "active" }, pagination),
    );
  },

  async getBySlug(vendorId: string, slug: string): Promise<ProductDoc> {
    await connectToDatabase();
    const product = await productRepository.findBySlug(vendorId, slug);
    if (!product) throw Errors.notFound("Product not found");
    // Fire-and-forget view counter.
    Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).exec().catch(() => {});
    return product;
  },
};
