"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAvatarAction } from "../actions";

/**
 * Pick an image and upload it straight to Cloudinary.
 *
 * The file does not pass through this application: `/api/uploads` returns a
 * signature scoped to the caller's own avatar, and the browser POSTs the file
 * to Cloudinary with it. That keeps phone-sized photos clear of the 4.5MB body
 * limit on Server Actions and Route Handlers.
 *
 * The avatar saves itself as soon as the upload succeeds, rather than waiting
 * for the form's Save button. Picking a photo reads as a finished action, and
 * staging it meant a reload threw the change away while the image was already
 * sitting in Cloudinary. It saves through its own action, which touches only
 * the avatar — so a name being edited at the time is not committed with it.
 */

/** Refused before upload rather than after, so the user waits for nothing. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

export function AvatarUpload({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * A local preview shown while the upload is in flight.
   *
   * Object URLs are revoked when replaced or when the upload settles: each one
   * pins the whole file in memory until it is, and a user trying five photos
   * would otherwise hold all five.
   */
  const [preview, setPreview] = useState<string | null>(null);

  function replacePreview(next: string | null) {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next;
    });
  }

  /**
   * Save the avatar on its own, without waiting for the form to be submitted.
   *
   * The image is already in Cloudinary by this point, so leaving it staged in
   * React state meant a reload silently discarded a change the user had every
   * reason to think was finished.
   */
  async function persist(url: string) {
    const result = await updateAvatarAction({ avatar: url });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onChange(url);
    router.refresh();
  }

  async function upload(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, GIF or AVIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`);
      return;
    }

    replacePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const signRes = await fetch("/api/uploads", { method: "POST" });
      const signed = (await signRes.json()) as
        | { ok: true; data: SignedUpload }
        | { ok: false; error: { message: string } };

      if (!signed.ok) throw new Error(signed.error.message);

      const { cloudName, apiKey, timestamp, signature, publicId } = signed.data;

      // Exactly the parameters that were signed, plus the file and api_key.
      // Anything extra and Cloudinary rejects the signature.
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", apiKey);
      body.append("timestamp", String(timestamp));
      body.append("public_id", publicId);
      body.append("overwrite", "true");
      body.append("signature", signature);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body },
      );
      const result = (await uploadRes.json()) as
        | { secure_url: string }
        | { error: { message: string } };

      if (!uploadRes.ok || "error" in result) {
        throw new Error("error" in result ? result.error.message : "Upload failed");
      }

      // The versioned `secure_url`, not a hand-built one: the public id is
      // stable per user, so the version is the only thing that busts the CDN
      // cache when an avatar is replaced.
      await persist(result.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      replacePreview(null);
      // Let the same file be picked again after a failure — without this the
      // input's value is unchanged and `onChange` never fires a second time.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const shown = preview ?? value;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: previews and
            historical Google avatars are not optimizer-eligible hosts. */}
        <img
          src={shown || "/avatar-placeholder.svg"}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 rounded-full border border-zinc-200 object-cover dark:border-zinc-800"
          onError={(e) => {
            e.currentTarget.src = "/avatar-placeholder.svg";
          }}
        />
        {uploading ? (
          <span
            role="status"
            aria-label="Uploading"
            className="absolute inset-0 grid place-items-center rounded-full bg-zinc-900/50 text-[10px] font-medium text-white"
          >
            …
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {uploading ? "Uploading…" : value ? "Change photo" : "Upload photo"}
          </button>

          {value && !uploading ? (
            <button
              type="button"
              disabled={disabled || removing}
              onClick={() => {
                setError(null);
                startRemoving(async () => {
                  const result = await updateAvatarAction({ avatar: "" });
                  if (!result.ok) {
                    setError(result.error.message);
                    return;
                  }
                  onChange("");
                  router.refresh();
                });
              }}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-500 transition hover:text-red-600 disabled:opacity-50 dark:text-zinc-400"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">JPEG, PNG, WebP, GIF or AVIF. Up to 5MB.</p>
        )}
      </div>
    </div>
  );
}
