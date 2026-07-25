import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const submitReviewSchema = z.object({
  productId: objectId,
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(2000).optional(),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
