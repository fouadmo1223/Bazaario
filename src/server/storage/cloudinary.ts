import { createHash } from "node:crypto";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";

/**
 * Signed direct-to-Cloudinary uploads.
 *
 * ## Why the browser uploads, not the server
 *
 * The file never passes through this application. A server-side upload would
 * mean the image arriving as a request body first, and both Server Actions and
 * Route Handlers on Vercel cap that at 4.5MB — a limit a phone photo clears
 * routinely. Signing instead lets the browser POST straight to Cloudinary, so
 * the size ceiling is Cloudinary's and no bandwidth is paid for twice.
 *
 * ## Why there is no SDK
 *
 * The `cloudinary` package is a large dependency for what is, on this path,
 * one SHA-1. The signature is defined by Cloudinary as: take the parameters
 * being signed, sort by key, join as `k=v` with `&`, append the API secret,
 * SHA-1 the result. That is `signature()` below and nothing else is needed —
 * the browser talks to Cloudinary's REST endpoint directly.
 *
 * If deletion of orphaned assets is added later, reconsider: the admin API is
 * more surface than is worth hand-rolling.
 *
 * ## What the signature constrains
 *
 * A signature is a capability, so it must not be broader than the action it is
 * issued for. `public_id` is derived from the user id server-side and signed,
 * which means a signature handed to one user can only ever write that user's
 * avatar — replaying it cannot touch product media or another account. The
 * client chooses nothing that is signed.
 */

export type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  folder: string;
};

/** Cloudinary's signing rule: sorted `k=v` pairs, `&`-joined, secret appended, SHA-1. */
function signature(params: Record<string, string | number>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(canonical + apiSecret).digest("hex");
}

/**
 * Credentials, or a clear failure.
 *
 * All three are `optional()` in the env schema because the app boots without
 * media configured. This is the point where that stops being acceptable, so it
 * fails here with a message naming the missing variables rather than sending an
 * upload at Cloudinary with `undefined` for a key.
 */
function credentials() {
  const env = getServerEnv();
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw Errors.internal(
      "Image uploads are not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }
  return { cloudName, apiKey, apiSecret };
}

/** Folder every avatar lives in. Also the prefix `isAvatarUrl` checks for. */
export const AVATAR_FOLDER = "avatars";

/**
 * Sign an avatar upload for one user.
 *
 * The `public_id` is fixed per user, so a new upload *replaces* the old asset
 * rather than accumulating one image per change. Cloudinary returns a versioned
 * URL (`/v1712.../`), so the replacement still busts caches despite the stable
 * id — which is why the stored value must be the returned `secure_url` and not
 * a URL assembled by hand.
 */
export function signAvatarUpload(userId: string): SignedUpload {
  const { cloudName, apiKey, apiSecret } = credentials();

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${AVATAR_FOLDER}/${userId}`;

  // `overwrite` is signed rather than left to the client: without it a replayed
  // signature could be used to create assets alongside the real one.
  const signed = { overwrite: "true", public_id: publicId, timestamp };

  return {
    cloudName,
    apiKey,
    timestamp,
    signature: signature(signed, apiSecret),
    publicId,
    folder: AVATAR_FOLDER,
  };
}

/** Folder chat attachments live in, namespaced per uploader. */
export const CHAT_FOLDER = "chat";

/**
 * Sign a chat-attachment upload for one user.
 *
 * Unlike the avatar signer this fixes no `public_id`: a thread accumulates many
 * files, so Cloudinary assigns each a fresh id inside the user's `chat/<id>`
 * folder. `resource_type` is chosen by the caller as `auto` at upload time
 * (images and videos both), which is a URL path segment and not part of the
 * signature. Only `folder` and `timestamp` are signed — enough to bind the
 * capability to this user's folder without freezing the filename.
 */
export function signChatUpload(userId: string): SignedUpload {
  const { cloudName, apiKey, apiSecret } = credentials();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${CHAT_FOLDER}/${userId}`;
  const signed = { folder, timestamp };

  return {
    cloudName,
    apiKey,
    timestamp,
    signature: signature(signed, apiSecret),
    publicId: "",
    folder,
  };
}

/**
 * Is this a chat-attachment URL on *our* Cloudinary account?
 *
 * Attachments arrive from the client as plain strings on a message the sender
 * could POST directly, and other people's browsers will load them — so the send
 * path validates every URL through here before storing it, the same way the
 * avatar action validates its one URL. Anything not under our cloud's `chat/`
 * folder is refused, which keeps `<img>`/`<video>` src values to assets this
 * application actually produced.
 */
export function isChatAttachmentUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const env = getServerEnv();
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "res.cloudinary.com") return false;
  if (!env.CLOUDINARY_CLOUD_NAME) return false;

  // `/<cloud>/(image|video|raw)/upload/<transforms?>/v<version>/chat/<userId>/<id>.<ext>`
  const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  return parsed.pathname.includes(`/upload/`) && parsed.pathname.includes(`/${CHAT_FOLDER}/`);
}

/**
 * Is this a URL for the given user's avatar on *our* Cloudinary account?
 *
 * The upload endpoint constrains what a browser can write, but the profile
 * action takes a URL, and a URL is just a string — anyone can POST to that
 * action directly. Checking here keeps the stored value to something this
 * application actually produced, which is what makes it safe to hand to
 * `next/image` (whose optimizer will fetch whatever host it is told to).
 */
export function isOwnAvatarUrl(url: string, userId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const env = getServerEnv();
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "res.cloudinary.com") return false;

  // `/<cloud>/image/upload/<transforms?>/v<version>/avatars/<userId>.<ext>`
  const expected = `/${env.CLOUDINARY_CLOUD_NAME}/`;
  if (!parsed.pathname.startsWith(expected)) return false;

  const withoutExtension = parsed.pathname.replace(/\.[a-z0-9]+$/i, "");
  return withoutExtension.endsWith(`/${AVATAR_FOLDER}/${userId}`);
}
