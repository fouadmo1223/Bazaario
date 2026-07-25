"use server";

import { revalidatePath } from "next/cache";
import { reviewService } from "@/server/services/review.service";
import { requireUser } from "@/server/security/current-user";
import { rateLimit } from "@/server/security/rate-limit";
import { Vendor } from "@/server/database/models/vendor.model";
import { Product } from "@/server/database/models/product.model";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { submitReviewSchema } from "./schemas";

/**
 * Post (or update) a review.
 *
 * Re-authenticates — a server action is reachable by direct POST — and the
 * verified-purchase gate lives in the service, not here, so the same rule holds
 * however the action is reached. Rate limited because it writes and then
 * recomputes an aggregate.
 */
export async function submitReviewAction(input: unknown): Promise<ApiResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await rateLimit(`review:${user.id}`, { max: 20, windowSec: 300 });

    const parsed = submitReviewSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid review", parsed.error.flatten());

    const review = await reviewService.submit(
      { id: user.id },
      {
        productId: parsed.data.productId,
        rating: parsed.data.rating,
        title: parsed.data.title ?? null,
        body: parsed.data.body ?? null,
      },
    );

    // The product page is ISR-cached; without this the shopper posts a review
    // and then stares at a page that still shows the old rating and no review.
    const product = await Product.findById(parsed.data.productId).select("slug vendor");
    if (product) {
      const vendor = await Vendor.findById(product.vendor).select("slug");
      if (vendor) revalidatePath(`/v/${vendor.slug}/p/${product.slug}`);
    }

    return ok({ id: String(review._id) }, { message: "Thanks for your review." });
  } catch (err) {
    return toFailure(err);
  }
}
