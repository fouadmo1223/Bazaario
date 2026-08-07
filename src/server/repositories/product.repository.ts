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
    // A case-insensitive partial match on title/description — not `$text`,
    // which only matches whole stemmed words and so misses "as you type"
    // input like "drif" for "Drift" until the last letter lands.
    if (f.search) {
      const escaped = f.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }
    return query;
  }

  async search(filters: ProductFilters, pagination: PaginationInput): Promise<Paginated<ProductDoc>> {
    const filter = this.buildFilter(filters);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;
    const sort = toSortObject(pagination);

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).populate("brand").exec(),
      Product.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, { page, limit });
  }

  findBySlug(vendor: string, slug: string): Promise<ProductDoc | null> {
    return this.findOne({ vendor, slug });
  }
}

export const productRepository = new ProductRepository();
