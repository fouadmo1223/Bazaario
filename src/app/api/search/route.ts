import type { NextRequest } from "next/server";
import { catalogService } from "@/server/services/catalog.service";
import { json, route } from "@/shared/lib/api-response";

/**
 * Live search-as-you-type for the storefront header's dropdown.
 *
 * Marketplace-wide and read-only, same as every other `catalogService` read —
 * no auth needed, nothing here can surface a draft or a suspended vendor's
 * product.
 */
export const GET = route(async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const items = await catalogService.quickSearch(q, 6);

  return json({
    items: items.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      image: p.image,
      price: p.price,
      priceRange: p.priceRange,
      vendorSlug: p.vendorSlug,
    })),
  });
});
