import { reviewService } from "@/server/services/review.service";
import { getCurrentUser } from "@/server/security/current-user";

/**
 * Read models for the storefront review section. Server Components render these
 * and hand plain, serializable data to the client form — no Mongoose documents
 * cross the boundary.
 */

export type ReviewView = {
  id: string;
  author: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  /** Marks the viewer's own review so the UI can label and edit it. */
  mine: boolean;
};

export type ProductReviews = {
  items: ReviewView[];
  total: number;
  /** The viewer's existing review, so the form opens prefilled. */
  own: { rating: number; title: string; body: string } | null;
  /** Whether to show the form at all — a review needs an account. */
  canWrite: boolean;
};

type PopulatedUser = { _id: unknown; name?: string | null };

export async function getProductReviews(productId: string): Promise<ProductReviews> {
  const user = await getCurrentUser();

  const [page, own] = await Promise.all([
    reviewService.listForProduct(productId, { limit: "20" }),
    user ? reviewService.getOwn({ id: user.id }, productId) : Promise.resolve(null),
  ]);

  return {
    items: page.items.map((r) => {
      const author = r.user as unknown as PopulatedUser | null;
      const mine = user != null && String(author?._id ?? r.user) === user.id;
      return {
        id: String(r._id),
        author: author?.name ?? "Anonymous",
        rating: r.rating,
        title: r.title ?? null,
        body: r.body ?? null,
        createdAt: r.createdAt.toISOString(),
        mine,
      };
    }),
    total: page.total,
    own: own ? { rating: own.rating, title: own.title ?? "", body: own.body ?? "" } : null,
    canWrite: user != null,
  };
}
