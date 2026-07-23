import { z } from "zod";

export const mediaInputSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  type: z.enum(["image", "video", "image360"]).default("image"),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  blurDataUrl: z.string().optional(),
});

export const attributeInputSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string()).default([]),
  variantDefining: z.boolean().default(true),
});

export const createProductSchema = z.object({
  type: z.enum(["simple", "variable"]).default("simple"),
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).optional(),
  description: z.string().default(""),
  shortDescription: z.string().optional(),
  brand: z.string().optional(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  attributes: z.array(attributeInputSchema).default([]),
  media: z.array(mediaInputSchema).default([]),
  price: z.number().min(0).default(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  stock: z.number().int().min(0).default(0),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  weight: z.number().nullable().optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  featured: z.boolean().default(false),
  seo: z
    .object({
      title: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      keywords: z.array(z.string()).default([]),
    })
    .optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const variantInputSchema = z.object({
  options: z.record(z.string(), z.string()),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  weight: z.number().nullable().optional(),
  image: z.string().url().nullable().optional(),
  isActive: z.boolean().default(true),
});

/**
 * The variant editor saves the option definitions and the variant matrix in one
 * call: the two are inseparable — a variant's `options` are meaningless without
 * the attributes that name them, and saving them apart could leave a product
 * whose variants reference an option it no longer declares.
 *
 * SKUs must be unique within the payload. They carry a per-vendor unique index,
 * and `syncVariants` deletes-then-inserts, so a collision inside one save would
 * fail the insert midway and is far friendlier to catch here.
 */
export const variantMatrixSchema = z
  .object({
    attributes: z.array(attributeInputSchema).default([]),
    variants: z.array(variantInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.variants.forEach((v, i) => {
      const sku = v.sku.trim().toLowerCase();
      if (seen.has(sku)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate SKU "${v.sku}"`,
          path: ["variants", i, "sku"],
        });
      }
      seen.add(sku);
    });
  });

/**
 * A query-string flag. `z.coerce.boolean()` is wrong here: it applies
 * `Boolean(value)`, and `Boolean("false")` is `true` — so `?inStock=false`
 * would filter *to* in-stock items. Only the literal "true"/"1" mean true.
 */
const queryFlag = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

/** Filters usable by any caller, including anonymous storefront visitors. */
export const storefrontFilterSchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: queryFlag,
  featured: queryFlag,
  search: z.string().max(200).optional(),
});

/**
 * Admin/dashboard query. Adds `status`, which must never be caller-controlled on
 * the storefront — that would expose draft and archived products.
 */
export const productQuerySchema = storefrontFilterSchema.extend({
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type VariantMatrixInput = z.infer<typeof variantMatrixSchema>;
export type AttributeInput = z.infer<typeof attributeInputSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type StorefrontFilterInput = z.infer<typeof storefrontFilterSchema>;
