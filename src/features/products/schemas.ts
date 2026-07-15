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
});

export const productQuerySchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
