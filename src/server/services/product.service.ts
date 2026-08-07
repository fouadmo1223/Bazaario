import { connectToDatabase } from "@/server/database/connection";
import { productRepository, type ProductFilters } from "@/server/repositories/product.repository";
import { Product, type ProductDoc } from "@/server/database/models/product.model";
import { Variant, type VariantDoc } from "@/server/database/models/variant.model";
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
  AttributeInput,
  ProductQueryInput,
} from "@/features/products/schemas";

/**
 * A product as the storefront renders it — plain and JSON-safe, so it survives
 * the Redis round-trip unchanged. Deliberately not `ProductDoc`: see the note
 * on `listStorefront`.
 */
export type StorefrontProduct = {
  id: string;
  slug: string;
  title: string;
  titleAr: string | null;
  type: "simple" | "variable";
  price: number;
  priceRange: { min: number; max: number } | null;
  compareAtPrice: number | null;
  image: string | null;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
};

function toStorefrontProduct(p: ProductDoc): StorefrontProduct {
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    titleAr: p.titleAr ?? null,
    type: p.type as "simple" | "variable",
    price: p.price,
    priceRange: p.priceRange
      ? { min: p.priceRange.min ?? 0, max: p.priceRange.max ?? 0 }
      : null,
    compareAtPrice: p.compareAtPrice ?? null,
    image: p.media[0]?.url ?? null,
    ratingAvg: p.ratingAvg ?? 0,
    ratingCount: p.ratingCount ?? 0,
    stock: p.stock ?? 0,
  };
}

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

  /**
   * Replace a variable product's option definitions and its variant matrix, and
   * refresh the denormalized price range.
   *
   * Attributes and variants are saved together because they are one thing: a
   * variant's `options` only mean something against the attributes that name
   * them. `priceRange` and the `from` price are computed from **active**
   * variants only — an inactive combination is not something a shopper can buy,
   * so pricing the card off it would advertise a price that leads nowhere.
   */
  async syncVariants(
    vendorId: string,
    productId: string,
    input: { attributes: AttributeInput[]; variants: VariantInput[] },
    actorId: string,
  ): Promise<void> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    if (!product) throw Errors.notFound("Product not found");
    if (product.type !== "variable") throw Errors.badRequest("Product is not variable");

    product.set(
      "attributes",
      input.attributes.map((a) => ({
        name: a.name,
        values: a.values,
        variantDefining: a.variantDefining,
      })),
    );

    await Variant.deleteMany({ product: productId });
    if (input.variants.length) {
      await Variant.insertMany(
        input.variants.map((v) => ({ ...v, vendor: vendorId, product: productId, createdBy: actorId })),
      );
    }

    const activePrices = input.variants.filter((v) => v.isActive).map((v) => v.price);
    if (activePrices.length) {
      product.priceRange = { min: Math.min(...activePrices), max: Math.max(...activePrices) };
      product.price = Math.min(...activePrices);
    } else {
      product.priceRange = { min: null, max: null };
    }

    await product.save();
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "product.variants.sync",
      entity: "Product", entityId: productId, diff: { variantCount: input.variants.length },
    });
    await invalidateVendorProducts(vendorId);
  },

  /**
   * All variants for the dashboard editor — including inactive ones, which the
   * storefront `listVariants` deliberately hides. The editor must show them so a
   * vendor can see and re-enable a combination they previously turned off.
   */
  async listAllVariants(vendorId: string, productId: string): Promise<VariantDoc[]> {
    await connectToDatabase();
    return Variant.find({ vendor: vendorId, product: productId }).sort({ createdAt: 1 }).exec();
  },

  async list(vendorId: string, query: ProductQueryInput, pagination: PaginationInput): Promise<Paginated<ProductDoc>> {
    await connectToDatabase();
    const filters: ProductFilters = { vendor: vendorId, ...query };
    return productRepository.search(filters, pagination);
  },

  /**
   * A variable product's purchasable variants, for the storefront picker.
   * Inactive variants are excluded — the shopper should not be offered a
   * combination the cart would then reject.
   */
  async listVariants(vendorId: string, productId: string): Promise<VariantDoc[]> {
    await connectToDatabase();
    return Variant.find({ vendor: vendorId, product: productId, isActive: true })
      .sort({ createdAt: 1 })
      .exec();
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
  /**
   * Storefront listing, cached for 60s.
   *
   * Returns **plain objects, not Mongoose documents**, and that is load-bearing
   * rather than tidiness. `cached()` round-trips its value through
   * `JSON.stringify`, which invokes the schema's `toJSON` — and `basePlugin`'s
   * transform renames `_id` to `id`. Caching documents therefore returned one
   * shape on a cache miss and a different one on every hit for the next minute,
   * while the type signature promised `ProductDoc` throughout. The vendor page
   * read `p._id`, got `undefined` on each cached read, and rendered every card
   * with the same React key.
   *
   * Mapping here means the cached value and the fresh value are the same shape
   * by construction, and the type says what callers actually receive.
   */
  async listStorefront(vendorId: string, query: unknown): Promise<Paginated<StorefrontProduct>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    const filters = storefrontFilterSchema.parse(query ?? {});

    return cached(listCacheKey(vendorId, filters, pagination), 60, async () => {
      const result = await productRepository.search(
        { ...filters, vendor: vendorId, status: "active" },
        pagination,
      );
      return { ...result, items: result.items.map(toStorefrontProduct) };
    });
  },

  /** One product within a vendor's scope. For the dashboard, so drafts count. */
  async getById(vendorId: string, productId: string): Promise<ProductDoc> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    if (!product) throw Errors.notFound("Product not found");
    return product;
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
