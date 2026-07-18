import { connectToDatabase } from "@/server/database/connection";
import { Product, type ProductDoc } from "@/server/database/models/product.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { Category } from "@/server/database/models/category.model";
import { Brand } from "@/server/database/models/brand.model";
import { cached } from "@/server/cache/redis";
import { productRepository } from "@/server/repositories/product.repository";
import { storefrontFilterSchema, type StorefrontFilterInput } from "@/features/products/schemas";
import { paginationSchema, buildPaginated, toSortObject, type Paginated } from "@/shared/lib/pagination";
import type { QueryFilter } from "mongoose";
import type { ProductRaw } from "@/server/database/models/product.model";

/**
 * Public, marketplace-wide catalogue reads.
 *
 * This is the one deliberate exception to the vendor-scoping rule in
 * ARCHITECTURE.md §5. That rule governs *staff* access — a vendor's admin must
 * never read another vendor's data. This path is different: it serves anonymous
 * shoppers the public catalogue, which spans vendors by definition. It is
 * read-only, exposes only published data, and never accepts a vendor scope from
 * the caller.
 *
 * Two invariants hold everywhere below:
 *   1. products must be `status: "active"`
 *   2. their vendor must be `status: "active"` — a suspended vendor disappears
 *      from the marketplace rather than continuing to sell
 */

const CACHE_TTL = 60;

/**
 * Ids of vendors currently allowed to appear.
 *
 * Resolved to a list and used with `$in` rather than joined per query. Vendor
 * count is small next to product count, and this keeps the filter usable by the
 * existing product repository. If vendors ever outgrow this, move to an
 * aggregation `$lookup` on `vendor`.
 */
async function activeVendorIds(): Promise<string[]> {
  return cached("catalog:active_vendor_ids", CACHE_TTL, async () => {
    const vendors = await Vendor.find({ status: "active" }).select("_id");
    return vendors.map((v) => String(v._id));
  });
}

/** Slug + name for each vendor, for linking products back to their store. */
async function vendorLookup(ids: string[]): Promise<Map<string, { name: string; slug: string }>> {
  if (ids.length === 0) return new Map();
  const vendors = await Vendor.find({ _id: { $in: ids } }).select("name slug");
  return new Map(vendors.map((v) => [String(v._id), { name: v.name, slug: v.slug }]));
}

export type CatalogProduct = {
  id: string;
  slug: string;
  title: string;
  /** For a variable product this is the lowest variant price ("from"). */
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
  /** Variable products can't be added from a card — they need an option chosen. */
  isVariable: boolean;
  /** Populated for variable products so listings can show a "from X" range. */
  priceRange: { min: number; max: number } | null;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
};

/** Shape a product for the storefront, resolving its vendor for links. */
function toCatalogProduct(
  p: ProductDoc,
  vendors: Map<string, { name: string; slug: string }>,
): CatalogProduct {
  const vendor = vendors.get(String(p.vendor));
  const isVariable = p.type === "variable";
  const range = p.priceRange;

  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? null,
    image: p.media[0]?.url ?? null,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    stock: p.stock,
    isVariable,
    priceRange:
      isVariable && range?.min != null && range?.max != null
        ? { min: range.min, max: range.max }
        : null,
    vendorId: String(p.vendor),
    vendorName: vendor?.name ?? "",
    vendorSlug: vendor?.slug ?? "",
  };
}

async function decorate(items: ProductDoc[]): Promise<CatalogProduct[]> {
  const vendors = await vendorLookup([...new Set(items.map((p) => String(p.vendor)))]);
  return items.map((p) => toCatalogProduct(p, vendors));
}

export type CatalogSort = "newest" | "price_asc" | "price_desc" | "rating" | "popular";

/** Map a UI sort choice onto a pagination sort. Unknown values fall back. */
function sortFor(sort: CatalogSort | undefined): { sort: string; order: "asc" | "desc" } {
  switch (sort) {
    case "price_asc": return { sort: "price", order: "asc" };
    case "price_desc": return { sort: "price", order: "desc" };
    case "rating": return { sort: "ratingAvg", order: "desc" };
    case "popular": return { sort: "soldCount", order: "desc" };
    default: return { sort: "createdAt", order: "desc" };
  }
}

export const catalogService = {
  /**
   * Browse the whole marketplace.
   *
   * `category` and `brand` arrive as *slugs* (they come from a shareable URL),
   * and one slug maps to many ids because each vendor has its own Category and
   * Brand rows. Both are resolved to id sets here and matched with `$in`, so
   * "footwear" means every vendor's footwear rather than one store's.
   *
   * `vendor` and `status` are pinned after the caller's filters, so a crafted
   * query can neither surface drafts nor pin the listing to a suspended vendor.
   */
  async listProducts(
    query: unknown,
    opts: { sort?: CatalogSort; vendorSlug?: string } = {},
  ): Promise<Paginated<CatalogProduct>> {
    await connectToDatabase();

    const filters: StorefrontFilterInput = storefrontFilterSchema.parse(query ?? {});
    const pagination = paginationSchema.parse({ ...(query as object), ...sortFor(opts.sort) });

    let allowed = await activeVendorIds();

    // Narrowing to one store is still a *subset* of the active vendors, so a
    // suspended vendor cannot be reached by naming its slug.
    if (opts.vendorSlug) {
      const vendor = await Vendor.findOne({ slug: opts.vendorSlug, status: "active" }).select("_id");
      allowed = vendor && allowed.includes(String(vendor._id)) ? [String(vendor._id)] : [];
    }
    if (allowed.length === 0) {
      return buildPaginated<CatalogProduct>([], 0, pagination);
    }

    // Resolve slug facets before building the filter; an unknown slug matches
    // nothing rather than being ignored (which would silently show everything).
    let categoryIds: string[] | null = null;
    if (filters.category) {
      const category = await this.categoryBySlug(filters.category);
      categoryIds = category?.ids ?? [];
    }
    let brandIds: string[] | null = null;
    if (filters.brand) {
      const brands = await this.brands();
      brandIds = brands.find((b) => b.slug === filters.brand)?.ids ?? [];
    }
    if (categoryIds?.length === 0 || brandIds?.length === 0) {
      return buildPaginated<CatalogProduct>([], 0, pagination);
    }

    const filter = productRepository.buildFilter({
      ...filters,
      // Slugs are resolved below; drop them so buildFilter can't match a slug
      // against an ObjectId field and quietly return nothing.
      category: undefined,
      brand: undefined,
      // buildFilter needs a vendor; the $in below replaces it.
      vendor: allowed[0],
      status: "active",
    }) as QueryFilter<ProductRaw>;
    filter.vendor = { $in: allowed };
    if (categoryIds) filter.categories = { $in: categoryIds };
    if (brandIds) filter.brand = { $in: brandIds };

    const skip = (pagination.page - 1) * pagination.limit;
    const sort = filters.search
      ? ({ score: { $meta: "textScore" } } as unknown as Record<string, 1 | -1>)
      : toSortObject(pagination);

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(pagination.limit).exec(),
      Product.countDocuments(filter).exec(),
    ]);

    return buildPaginated(await decorate(items), total, pagination);
  },

  /** Featured products for the home page. */
  async featured(limit = 8): Promise<CatalogProduct[]> {
    await connectToDatabase();
    const allowed = await activeVendorIds();
    if (allowed.length === 0) return [];

    const items = await Product.find({
      vendor: { $in: allowed },
      status: "active",
      featured: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return decorate(items);
  },

  /** Best sellers, used to fill the home page below the featured rail. */
  async bestSellers(limit = 8): Promise<CatalogProduct[]> {
    await connectToDatabase();
    const allowed = await activeVendorIds();
    if (allowed.length === 0) return [];

    const items = await Product.find({
      vendor: { $in: allowed },
      status: "active",
      soldCount: { $gt: 0 },
    })
      .sort({ soldCount: -1 })
      .limit(limit)
      .exec();

    return decorate(items);
  },

  /**
   * Categories across the marketplace, keyed by slug.
   *
   * Categories are per-vendor rows, so two vendors both selling "Footwear" have
   * two Category documents. The marketplace presents one entry per slug with the
   * ids folded together, so a shopper browsing "Footwear" sees every vendor's.
   */
  async categories(): Promise<{ slug: string; name: string; image: string | null; ids: string[] }[]> {
    await connectToDatabase();
    const allowed = await activeVendorIds();
    if (allowed.length === 0) return [];

    return cached(`catalog:categories:${allowed.length}`, CACHE_TTL, async () => {
      const rows = await Category.find({
        vendor: { $in: allowed },
        isActive: true,
      })
        .sort({ order: 1, name: 1 })
        .exec();

      const bySlug = new Map<string, { slug: string; name: string; image: string | null; ids: string[] }>();
      for (const c of rows) {
        const existing = bySlug.get(c.slug);
        if (existing) {
          existing.ids.push(String(c._id));
          existing.image ??= c.image ?? null;
        } else {
          bySlug.set(c.slug, {
            slug: c.slug,
            name: c.name,
            image: c.image ?? null,
            ids: [String(c._id)],
          });
        }
      }
      return [...bySlug.values()];
    });
  },

  /** One marketplace category by slug, with every vendor's matching ids. */
  async categoryBySlug(slug: string) {
    const all = await this.categories();
    return all.find((c) => c.slug === slug) ?? null;
  },

  /** Brands across the marketplace, folded by slug like categories. */
  async brands(): Promise<{ slug: string; name: string; ids: string[] }[]> {
    await connectToDatabase();
    const allowed = await activeVendorIds();
    if (allowed.length === 0) return [];

    return cached(`catalog:brands:${allowed.length}`, CACHE_TTL, async () => {
      const rows = await Brand.find({ vendor: { $in: allowed } }).sort({ name: 1 }).exec();
      const bySlug = new Map<string, { slug: string; name: string; ids: string[] }>();
      for (const b of rows) {
        const existing = bySlug.get(b.slug);
        if (existing) existing.ids.push(String(b._id));
        else bySlug.set(b.slug, { slug: b.slug, name: b.name, ids: [String(b._id)] });
      }
      return [...bySlug.values()];
    });
  },

  /** Storefronts to feature on the home page. */
  async vendors(limit = 8): Promise<{ id: string; name: string; slug: string; logo: string | null; description: string | null }[]> {
    await connectToDatabase();
    const rows = await Vendor.find({ status: "active" })
      .sort({ "stats.orders": -1, createdAt: -1 })
      .limit(limit)
      .exec();

    return rows.map((v) => ({
      id: String(v._id),
      name: v.name,
      slug: v.slug,
      logo: v.logo ?? null,
      description: v.description ?? null,
    }));
  },

  /** Lowest/highest active price, to bound the price filter inputs. */
  async priceBounds(): Promise<{ min: number; max: number }> {
    await connectToDatabase();
    const allowed = await activeVendorIds();
    if (allowed.length === 0) return { min: 0, max: 0 };

    return cached(`catalog:price_bounds:${allowed.length}`, CACHE_TTL, async () => {
      const [row] = await Product.aggregate<{ min: number; max: number }>([
        { $match: { vendor: { $in: allowed.map((id) => new Product.base.Types.ObjectId(id)) }, status: "active" } },
        { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
        { $project: { _id: 0, min: 1, max: 1 } },
      ]);
      return row ? { min: Math.floor(row.min), max: Math.ceil(row.max) } : { min: 0, max: 0 };
    });
  },
};
