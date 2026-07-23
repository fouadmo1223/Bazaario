import type { ChatMessagePayload } from "@/shared/hooks/use-socket";

export type ChatAttachment = ChatMessagePayload["attachments"][number];

/**
 * Upload one chat file straight to Cloudinary and return the stored attachment.
 *
 * The browser uploads directly — the file never passes through our server —
 * because Server Actions and Route Handlers cap a request body at 4.5MB, which
 * a phone video clears instantly. We only mint the signature; Cloudinary takes
 * the bytes. `resource_type=auto` lets one path handle both images and videos.
 */
/** Cloudinary's free tier caps a single asset at 100MB; keep well under it. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function uploadChatFile(file: File): Promise<ChatAttachment> {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error(`"${file.name}" is not an image or video.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 50MB.`);
  }

  const signRes = await fetch("/api/uploads/chat", { method: "POST", credentials: "include" });
  if (signRes.status === 401) {
    throw new Error("Your session has expired — refresh the page and sign in again.");
  }
  if (signRes.status === 429) {
    throw new Error("Too many uploads just now — wait a moment and try again.");
  }
  if (!signRes.ok) throw new Error("Could not start the upload. Please try again.");

  const body = (await signRes.json()) as {
    data?: { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string };
  };
  const sig = body.data;
  if (!sig) throw new Error("Attachments are not configured on this server.");

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    throw new Error("Upload failed — check your connection and try again.");
  }
  if (!uploadRes.ok) {
    // Cloudinary returns a JSON error with a human-readable reason.
    const reason = await uploadRes
      .json()
      .then((b: { error?: { message?: string } }) => b.error?.message)
      .catch(() => null);
    throw new Error(reason ? `Upload failed: ${reason}` : `"${file.name}" could not be uploaded.`);
  }

  const result = (await uploadRes.json()) as { secure_url?: string };
  if (!result.secure_url) throw new Error("Upload returned no URL.");

  return {
    url: result.secure_url,
    name: file.name,
    mime: file.type || undefined,
    size: file.size,
  };
}

/** How the transcript should render an attachment. */
export function attachmentKind(a: ChatAttachment): "image" | "video" | "file" {
  const mime = a.mime ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  // Fall back to the URL when the mime was not recorded.
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(a.url)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/i.test(a.url)) return "video";
  return "file";
}
