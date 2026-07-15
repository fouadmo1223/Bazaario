import { z } from "zod";

/** Shared offset-pagination query contract for list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export function buildPaginated<T>(
  items: T[],
  total: number,
  { page, limit }: Pick<PaginationInput, "page" | "limit">,
): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** Translate `{ sort, order }` into a Mongoose sort object. */
export function toSortObject(
  input: Pick<PaginationInput, "sort" | "order">,
  fallback = "createdAt",
): Record<string, 1 | -1> {
  const field = input.sort?.trim() || fallback;
  return { [field]: input.order === "asc" ? 1 : -1 };
}
