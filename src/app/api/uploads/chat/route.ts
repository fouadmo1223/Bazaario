import { requireUser } from "@/server/security/current-user";
import { rateLimit } from "@/server/security/rate-limit";
import { signChatUpload } from "@/server/storage/cloudinary";
import { json, route } from "@/shared/lib/api-response";

/**
 * Issue a signed Cloudinary upload for a chat attachment.
 *
 * Like the avatar signer, nothing the client sends influences what is signed:
 * the folder is derived from the session user (`chat/<id>`), so a signature
 * handed to one user can only ever write into that user's own attachment
 * folder. Whether the file is an image or a video is the browser's choice at
 * upload time (`resource_type=auto`) and is not part of the signature.
 */
export const POST = route(async () => {
  const user = await requireUser();

  // A signature is a Cloudinary write capability; bound so a script cannot pull
  // an unlimited supply in a loop.
  await rateLimit(`chat-upload-sign:${user.id}`, { max: 40, windowSec: 300 });

  return json(signChatUpload(user.id));
});

// Mints per-user credentials; must never be cached.
export const dynamic = "force-dynamic";
