import { connectToDatabase } from "@/server/database/connection";
import { Product } from "@/server/database/models/product.model";
import { Category } from "@/server/database/models/category.model";
import { couponService } from "@/server/services/coupon.service";

/**
 * Read-side models for the coupon dashboard. Server Components render these and
 * hand them to client forms, so every field is plain and serializable — no
 * Mongoose documents or ObjectIds cross the boundary.
 *
 * Unlike products, a coupon's full shape ships with the list: a vendor has a
 * handful of them and each is small, so fetching per-row on edit would buy
 * nothing. The edit form reads straight from the row it was opened on.
 */
export type CouponView = {
  id: string;
  code: string;
  description: string;
  type: "percentage" | "fixed" | "free_shipping";
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  appliesToProducts: string[];
  appliesToCategories: string[];
  /** `yyyy-mm-dd`, ready for a native date input; null when unset. */
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
};

export type Option = { id: string; name: string };

/** A date at `yyyy-mm-dd`, which is what `<input type="date">` reads and writes. */
function toDateInput(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function listVendorCoupons(vendorId: string): Promise<CouponView[]> {
  const coupons = await couponService.list(vendorId);
  return coupons.map((c) => ({
    id: String(c._id),
    code: c.code,
    description: c.description ?? "",
    type: c.type as CouponView["type"],
    value: c.value,
    minSpend: c.minSpend,
    maxDiscount: c.maxDiscount ?? null,
    usageLimit: c.usageLimit ?? null,
    perUserLimit: c.perUserLimit ?? null,
    usedCount: c.usedCount,
    appliesToProducts: c.appliesToProducts.map((p) => String(p)),
    appliesToCategories: c.appliesToCategories.map((cat) => String(cat)),
    startsAt: toDateInput(c.startsAt),
    expiresAt: toDateInput(c.expiresAt),
    isActive: c.isActive,
  }));
}

/**
 * The products and categories a coupon may be scoped to — this vendor's own,
 * offered as checkboxes in the form. Archived products are dropped: there is no
 * point scoping a new coupon to something no longer for sale.
 */
export async function getCouponFormOptions(
  vendorId: string,
): Promise<{ products: Option[]; categories: Option[] }> {
  await connectToDatabase();
  const [products, categories] = await Promise.all([
    Product.find({ vendor: vendorId, status: { $ne: "archived" } })
      .sort({ title: 1 })
      .select("title")
      .lean(),
    Category.find({ vendor: vendorId, isActive: true }).sort({ name: 1 }).select("name").lean(),
  ]);

  return {
    products: products.map((p) => ({ id: String(p._id), name: p.title })),
    categories: categories.map((c) => ({ id: String(c._id), name: c.name })),
  };
}
