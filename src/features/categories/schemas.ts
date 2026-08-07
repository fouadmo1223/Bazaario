import { z } from "zod";

/**
 * Create/edit payload for a vendor's own category.
 *
 * Flat only for now — `parent`/`path` exist on the model for a future subtree
 * UI, but this form doesn't offer one, so every category it creates is a root.
 */
export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).optional(),
  slug: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().default(null),
  image: z.string().trim().url().nullable().default(null),
  isActive: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
