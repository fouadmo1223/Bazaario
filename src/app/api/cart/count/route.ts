import type { NextRequest } from "next/server";
import { z } from "zod";
import { Cart } from "@/server/database/models/cart.model";
import { connectToDatabase } from "@/server/database/connection";
import { getCurrentUser } from "@/server/security/current-user";
import { readGuestToken } from "@/server/security/guest-token";
import { json, route } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

/**
 * Cart item count for the storefront badge.
 *
 * This exists as a route handler so the storefront pages can stay ISR-cached:
 * reading the cart cookie during their render would force them dynamic and
 * throw away the shared cache for every visitor. The badge fetches this instead.
 */

const querySchema = z.object({
  vendorId: z.string().regex(/^[0-9a-f]{24}$/i, "Invalid vendor"),
});

export const GET = route(async (req: NextRequest) => {
  const parsed = querySchema.safeParse({
    vendorId: req.nextUrl.searchParams.get("vendorId"),
  });
  if (!parsed.success) throw Errors.validation("Invalid vendor", parsed.error.flatten());

  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();

  // No session and no cookie means there is nothing to count yet.
  if (!user && !guestToken) return json({ count: 0 });

  await connectToDatabase();
  const cart = await Cart.findOne(
    user
      ? { vendor: parsed.data.vendorId, user: user.id }
      : { vendor: parsed.data.vendorId, guestToken },
  );

  const count = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return json({ count });
});
