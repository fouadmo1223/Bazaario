import { requireUser } from "@/server/security/current-user";
import { rateLimit } from "@/server/security/rate-limit";
import { signAvatarUpload } from "@/server/storage/cloudinary";
import { json, route } from "@/shared/lib/api-response";

/**
 * Issue a signed Cloudinary upload for the caller's own avatar.
 *
 * This hands out a capability, so it is deliberately narrow: the signature
 * covers a `public_id` derived from the session user, and nothing the client
 * sends influences what gets signed. There is no `target` or `folder` parameter
 * to tamper with — adding one later means re-checking that a customer cannot
 * request a signature for product media or another user's avatar.
 *
 * POST rather than GET because it is not cacheable or replayable in intent, and
 * because a GET that mints credentials is the kind of thing that ends up in a
 * proxy log or a browser history.
 */
export const POST = route(async () => {
  const user = await requireUser();

  // Each signature is a write to a fixed key, so abuse here is Cloudinary
  // bandwidth rather than data loss. Still bounded: a script pulling signatures
  // in a loop would otherwise be free.
  await rateLimit(`upload-sign:${user.id}`, { max: 20, windowSec: 300 });

  return json(signAvatarUpload(user.id));
});

// Mints per-user credentials; must never be cached.
export const dynamic = "force-dynamic";
