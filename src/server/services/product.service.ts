import { connectToDatabase } from "@/server/database/connection";
import { productRepository, type ProductFilters } from "@/server/repositories/product.repository";
import { Product, type ProductDoc } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { Market } from "@/server/database/models/market.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import { paginationSchema, type PaginationInput, type Paginated } from "@/shared/lib/pagination";
import { cached, getRedis } from "@/server/cache/redis";
import type {
  CreateProductInput,
  UpdateProductInput,
  VariantInput,
  ProductQueryInput,
} from "@/features/products/schemas";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);

async function uniqueSlug(market: string, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Bounded loop; collisions are rare within a single market.
  while (true) {
    const existing = await productRepository.findBySlug(market, slug);
    if (!existing || String(existing._id) === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

const listCacheKey = (market: string, q: unknown, p: unknown) =>
  `market:${market}:products:${JSON.stringify(q)}:${JSON.stringify(p)}`;

async function invalidateMarketProducts(market: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`market:${market}:products:*`);
  if (keys.length) await redis.del(...keys);
}

/**
 * Product domain service. All operations are market-scoped — the caller must
 * have already passed `requireMarketPermission(marketId, PRODUCT_WRITE)`.
 */
export const productService = {
  async create(marketId: string, input: CreateProductInput, actorId: string): Promise<ProductDoc> {
    await connectToDatabase();
    const base = slugify(input.slug ?? input.title);
    const slug = await uniqueSlug(marketId, base);

    const product = await Product.create({
      ...input,
      market: marketId,
      slug,
      createdBy: actorId,
      publishedAt: input.status === "active" ? new Date() : null,
    });

    await Market.updateOne({ _id: marketId }, { $inc: { "stats.products": 1 } });
    await invalidateMarketProducts(marketId);
    await writeAudit({
      actor: actorId, market: marketId, action: "product.create",
      entity: "Product", entityId: String(product._id), diff: { title: product.title },
    });
    return product;
  },

  async update(
    marketId: string,
    productId: string,
    input: UpdateProductInput,
    actorId: string,
  ): Promise<ProductDoc> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, market: marketId });
    if (!product) throw Errors.notFound("Product not found");

    if (input.slug && input.slug !== product.slug) {
      input.slug = await uniqueSlug(marketId, slugify(input.slug), productId);
    }
    Object.assign(product, input, { updatedBy: actorId });
    if (input.status === "active" && !product.publishedAt) product.publishedAt = new Date();
    await product.save();

    await invalidateMarketProducts(marketId);
    await writeAudit({
      actor: actorId, market: marketId, action: "product.update",
      entity: "Product", entityId: productId,
    });
    return product;
  },

  async remove(marketId: string, productId: string, actorId: string): Promise<void> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, market: marketId });
    if (!product) throw Errors.notFound("Product not found");
    await productRepository.softDeleteById(productId, actorId);
    await Variant.updateMany({ product: productId }, { $set: { deletedAt: new Date() } });
    await Market.updateOne({ _id: marketId }, { $inc: { "stats.products": -1 } });
    await invalidateMarketProducts(marketId);
    await writeAudit({
      actor: actorId, market: marketId, action: "product.delete",
      entity: "Product", entityId: productId,
    });
  },

  /** Replace a variable product's variants and refresh its denormalized price range. */
  async syncVariants(
    marketId: string,
    productId: string,
    variants: VariantInput[],
    actorId: string,
  ): Promise<void> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, market: marketId });
    if (!product) throw Errors.notFound("Product not found");
    if (product.type !== "variable") throw Errors.badRequest("Product is not variable");

    await Variant.deleteMany({ product: productId });
    if (variants.length) {
      await Variant.insertMany(
        variants.map((v) => ({ ...v, market: marketId, product: productId, createdBy: actorId })),
      );
      const prices = variants.map((v) => v.price);
      product.priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
      product.price = Math.min(...prices);
    } else {
      product.priceRange = { min: null, max: null };
    }
    await product.save();
    await invalidateMarketProducts(marketId);
  },

  async list(marketId: string, query: ProductQueryInput, pagination: PaginationInput): Promise<Paginated<ProductDoc>> {
    await connectToDatabase();
    const filters: ProductFilters = { market: marketId, ...query };
    return productRepository.search(filters, pagination);
  },

  /** Storefront read — active products only, cached in Redis. */
  async listStorefront(marketId: string, query: unknown): Promise<Paginated<ProductDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    return cached(listCacheKey(marketId, query, pagination), 60, () =>
      productRepository.search({ market: marketId, status: "active", ...(query as object) }, pagination),
    );
  },

  async getBySlug(marketId: string, slug: string): Promise<ProductDoc> {
    await connectToDatabase();
    const product = await productRepository.findBySlug(marketId, slug);
    if (!product) throw Errors.notFound("Product not found");
    // Fire-and-forget view counter.
    Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).exec().catch(() => {});
    return product;
  },
};
