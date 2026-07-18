import { connectToDatabase } from "@/server/database/connection";
import { Brand } from "@/server/database/models/brand.model";
import { Category } from "@/server/database/models/category.model";
import { Variant } from "@/server/database/models/variant.model";
import { productService } from "@/server/services/product.service";
import type { ProductDoc } from "@/server/database/models/product.model";
import type { Paginated } from "@/shared/lib/pagination";

/**
 * Read-side models for the vendor dashboard. Server Components render these and
 * pass them to client forms, so every field is plain and serializable — no
 * Mongoose documents or ObjectIds cross the boundary.
 */

export type ProductRow = {
  id: string;
  title: string;
  slug: string;
  type: "simple" | "variable";
  status: "draft" | "active" | "archived";
  price: number;
  /** Sum of variant stock for variable products; own stock otherwise. */
  stock: number;
  sku: string | null;
  image: string | null;
  featured: boolean;
  variantCount: number;
  updatedAt: string;
};

/** Everything the edit form needs to populate itself. */
export type ProductFormValues = {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  type: "simple" | "variable";
  status: "draft" | "active" | "archived";
  price: number;
  compareAtPrice: number | null;
  stock: number;
  sku: string;
  barcode: string;
  brand: string;
  categories: string[];
  tags: string[];
  featured: boolean;
  trackInventory: boolean;
  allowBackorder: boolean;
  media: { url: string; alt: string | null }[];
};

export type Option = { id: string; name: string };

async function variantStock(products: ProductDoc[]): Promise<Map<string, { stock: number; count: number }>> {
  const variableIds = products.filter((p) => p.type === "variable").map((p) => p._id);
  if (variableIds.length === 0) return new Map();

  const rows = await Variant.aggregate<{ _id: unknown; stock: number; count: number }>([
    { $match: { product: { $in: variableIds }, isActive: true } },
    { $group: { _id: "$product", stock: { $sum: "$stock" }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { stock: r.stock, count: r.count }]));
}

/**
 * A vendor's products for the management table.
 *
 * Unlike the storefront listing this includes drafts and archived items — that
 * is the point of the screen. It goes through `productService.list`, which is
 * vendor-scoped and separate from the public path that pins `status: "active"`.
 */
export async function listVendorProducts(
  vendorId: string,
  query: { page?: string; search?: string; status?: string },
): Promise<Paginated<ProductRow>> {
  await connectToDatabase();

  const status =
    query.status === "draft" || query.status === "active" || query.status === "archived"
      ? query.status
      : undefined;

  const result = await productService.list(
    vendorId,
    { ...(status ? { status } : {}), ...(query.search ? { search: query.search } : {}) },
    { page: Number(query.page ?? 1), limit: 20, order: "desc" },
  );

  const stock = await variantStock(result.items);

  return {
    ...result,
    items: result.items.map((p) => {
      const v = stock.get(String(p._id));
      return {
        id: String(p._id),
        title: p.title,
        slug: p.slug,
        type: p.type as "simple" | "variable",
        status: p.status as "draft" | "active" | "archived",
        price: p.price,
        stock: p.type === "variable" ? (v?.stock ?? 0) : p.stock,
        sku: p.sku ?? null,
        image: p.media[0]?.url ?? null,
        featured: p.featured,
        variantCount: v?.count ?? 0,
        updatedAt: p.updatedAt.toISOString(),
      };
    }),
  };
}

/** One product, shaped for the edit form. */
export async function getProductForEdit(
  vendorId: string,
  productId: string,
): Promise<ProductFormValues | null> {
  await connectToDatabase();
  // Vendor-scoped by the service, so another vendor's id simply resolves to
  // nothing rather than leaking across the tenant boundary.
  const product = await productService.getById(vendorId, productId).catch(() => null);
  if (!product) return null;

  return {
    id: String(product._id),
    title: product.title,
    slug: product.slug,
    description: product.description ?? "",
    shortDescription: product.shortDescription ?? "",
    type: product.type as "simple" | "variable",
    status: product.status as "draft" | "active" | "archived",
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    stock: product.stock,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    brand: product.brand ? String(product.brand) : "",
    categories: product.categories.map((c) => String(c)),
    tags: product.tags,
    featured: product.featured,
    trackInventory: product.trackInventory,
    allowBackorder: product.allowBackorder,
    media: product.media.map((m) => ({ url: m.url, alt: m.alt ?? null })),
  };
}

/** Categories and brands available to this vendor, for the form's selects. */
export async function getProductFormOptions(
  vendorId: string,
): Promise<{ categories: Option[]; brands: Option[] }> {
  await connectToDatabase();
  const [categories, brands] = await Promise.all([
    Category.find({ vendor: vendorId, isActive: true }).sort({ name: 1 }).select("name").lean(),
    Brand.find({ vendor: vendorId }).sort({ name: 1 }).select("name").lean(),
  ]);

  return {
    categories: categories.map((c) => ({ id: String(c._id), name: c.name })),
    brands: brands.map((b) => ({ id: String(b._id), name: b.name })),
  };
}
