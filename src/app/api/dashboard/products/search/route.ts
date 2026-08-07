import type { NextRequest } from "next/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorProducts } from "@/features/products/queries";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { json, route } from "@/shared/lib/api-response";

/** Live search-as-you-type for the dashboard product table's search box. */
export const GET = route(async (request: NextRequest) => {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return json({ items: [] });

  const { vendor } = await resolveActiveVendor();
  await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);

  const result = await listVendorProducts(String(vendor._id), { search: q, page: "1" });

  return json({
    items: result.items.slice(0, 6).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      image: p.image,
      price: p.price,
      status: p.status,
    })),
  });
});
