import { categoryService } from "@/server/services/category.service";

/**
 * Read-side model for the category dashboard. A vendor's list is small, so
 * the full shape ships with the row — same reasoning as `CouponView`.
 */
export type CategoryView = {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  description: string;
  image: string | null;
  isActive: boolean;
};

export async function listVendorCategories(vendorId: string): Promise<CategoryView[]> {
  const categories = await categoryService.list(vendorId);
  return categories.map((c) => ({
    id: String(c._id),
    name: c.name,
    nameAr: c.nameAr ?? "",
    slug: c.slug,
    description: c.description ?? "",
    image: c.image ?? null,
    isActive: c.isActive,
  }));
}
