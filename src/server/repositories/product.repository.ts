import { BaseRepository } from "./base.repository";
import { Product, type ProductRaw, type ProductDoc } from "@/server/database/models/product.model";
import type { QueryFilter } from "mongoose";
import { buildPaginated, toSortObject, type PaginationInput, type Paginated } from "@/shared/lib/pagination";

export type ProductFilters = {
  vendor: string;
  status?: "draft" | "active" | "archived";
  category?: string;
  brand?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  search?: string;
  featured?: boolean;
};

class ProductRepository extends BaseRepository<ProductRaw> {
  constructor() {
    super(Product);
  }

  /** Build a vendor-scoped Mongo filter from storefront/admin filters. */
  buildFilter(f: ProductFilters): QueryFilter<ProductRaw> {
    const query: QueryFilter<ProductRaw> = { vendor: f.vendor };
    if (f.status) query.status = f.status;
    if (f.category) query.categories = f.category;
    if (f.brand) query.brand = f.brand;
    if (f.featured != null) query.featured = f.featured;
    if (f.tags?.length) query.tags = { $in: f.tags };
    if (f.minRating != null) query.ratingAvg = { $gte: f.minRating };
    if (f.inStock) query.stock = { $gt: 0 };
    if (f.minPrice != null || f.maxPrice != null) {
      query.price = {};
      if (f.minPrice != null) query.price.$gte = f.minPrice;
      if (f.maxPrice != null) query.price.$lte = f.maxPrice;
    }
    if (f.search) query.$text = { $search: f.search };
    return query;
  }

  async search(filters: ProductFilters, pagination: PaginationInput): Promise<Paginated<ProductDoc>> {
    const filter = this.buildFilter(filters);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Relevance sort when text-searching, otherwise the requested sort.
    const sort = filters.search
      ? { score: { $meta: "textScore" } as const }
      : toSortObject(pagination);

    const q = Product.find(filter);
    if (filters.search) q.select({ score: { $meta: "textScore" } });

    const [items, total] = await Promise.all([
      q.sort(sort as Record<string, 1 | -1>).skip(skip).limit(limit).populate("brand").exec(),
      Product.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, { page, limit });
  }

  findBySlug(vendor: string, slug: string): Promise<ProductDoc | null> {
    return this.findOne({ vendor, slug });
  }
}

export const productRepository = new ProductRepository();
