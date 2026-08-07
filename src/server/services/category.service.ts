import { connectToDatabase } from "@/server/database/connection";
import { Category, type CategoryDoc } from "@/server/database/models/category.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import type { CategoryInput } from "@/features/categories/schemas";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

async function uniqueSlug(vendorId: string, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Bounded loop; collisions are rare within a single vendor's small category list.
  while (true) {
    const existing = await Category.findOne({ vendor: vendorId, slug });
    if (!existing || String(existing._id) === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

/**
 * Category management for the vendor dashboard.
 *
 * Every operation is vendor-scoped — the caller must already have passed
 * `requireVendorPermission(vendorId, PRODUCT_WRITE)`. Categories are per-vendor
 * (see the model comment); the storefront folds same-slug categories from
 * different vendors into one marketplace-facing tile in `catalogService`.
 */
export const categoryService = {
  async list(vendorId: string): Promise<CategoryDoc[]> {
    await connectToDatabase();
    return Category.find({ vendor: vendorId }).sort({ order: 1, name: 1 }).exec();
  },

  async create(vendorId: string, input: CategoryInput, actorId: string): Promise<CategoryDoc> {
    await connectToDatabase();
    const base = slugify(input.slug ?? input.name);
    const slug = await uniqueSlug(vendorId, base);

    const category = await Category.create({
      ...input,
      vendor: vendorId,
      slug,
      createdBy: actorId,
    });

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "category.create",
      entity: "Category",
      entityId: String(category._id),
      diff: { name: category.name },
    });
    return category;
  },

  async update(
    vendorId: string,
    categoryId: string,
    input: CategoryInput,
    actorId: string,
  ): Promise<CategoryDoc> {
    await connectToDatabase();
    const category = await Category.findOne({ _id: categoryId, vendor: vendorId });
    if (!category) throw Errors.notFound("Category not found");

    const base = slugify(input.slug ?? input.name);
    const slug = base === category.slug ? category.slug : await uniqueSlug(vendorId, base, categoryId);

    Object.assign(category, input, { slug, updatedBy: actorId });
    await category.save();

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "category.update",
      entity: "Category",
      entityId: categoryId,
    });
    return category;
  },

  /**
   * Hard-delete: unlike a product or coupon, a category carries no history
   * that needs preserving once nothing references it. Products keep their
   * own `categories` id list, which simply stops resolving to anything —
   * the storefront filters read through `catalogService`, which already
   * tolerates a category with zero products.
   */
  async remove(vendorId: string, categoryId: string, actorId: string): Promise<void> {
    await connectToDatabase();
    const category = await Category.findOne({ _id: categoryId, vendor: vendorId });
    if (!category) throw Errors.notFound("Category not found");
    await category.deleteOne();

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "category.delete",
      entity: "Category",
      entityId: categoryId,
    });
  },
};
